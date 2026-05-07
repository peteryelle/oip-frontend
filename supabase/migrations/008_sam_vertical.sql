-- =============================================================================
-- Migration 008 — SAM vertical integration
-- =============================================================================
-- Covers:
--   1. Insert `sam` row into verticals
--   2. Make signals.state nullable (safety check — required for SAM)
--   3. Add source_id + metadata columns to signals
--   4. Add dedup unique index on (vertical_id, source_id)
--   5. Add scores column to oip_signals
--   6. Create sam_subscriptions with RLS
--   7. Create tenant_api_keys with Vault reference + RLS
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. SAM vertical
-- -----------------------------------------------------------------------------
INSERT INTO verticals (slug, name, description)
VALUES (
  'sam',
  'Federal (SAM.gov)',
  'Federal contracting opportunities and awards from SAM.gov. Partitioned by OIP profile (NAICS, agency, notice type) rather than state.'
)
ON CONFLICT (slug) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 2. signals.state — ensure nullable
--    SLED rows carry a state code; SAM rows carry NULL.
--    If a NOT NULL constraint exists, drop it now before we ever try to insert
--    a SAM signal.
-- -----------------------------------------------------------------------------
ALTER TABLE signals
  ALTER COLUMN state DROP NOT NULL;


-- -----------------------------------------------------------------------------
-- 3. signals — new columns for SAM (additive; SLED rows get safe defaults)
-- -----------------------------------------------------------------------------

-- source_id: external primary key for the record, used for deduplication across
-- incremental scrape runs.
--   SAM:  notice_id (e.g. "abc123def456abc")
--   SLED: NULL (SLED deduplication relies on url uniqueness at the scraper level)
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS source_id text;

-- metadata: vertical-specific fields that don't belong as first-class columns.
--   SAM signals populate:
--     notice_id, naics_code, notice_type (PRESOL/COMBINE/etc.),
--     set_aside_code, response_deadline (ISO date), department_name, office_name
--   SLED signals carry: {} (empty, ignored)
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;


-- -----------------------------------------------------------------------------
-- 4. Deduplication index
--    Prevents the same SAM notice from being inserted twice across incremental
--    runs. Partial — only applies when source_id IS NOT NULL (SLED rows are
--    excluded).
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS signals_vertical_source_uniq
  ON signals (vertical_id, source_id)
  WHERE source_id IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 5. oip_signals — scores column for SAM deterministic scorer output
--    SAM rows carry the full scored_record dict:
--      { technical_fit, bid_risk, vdd_risk, total_score,
--        recommendation, evidence, scored_at }
--    SLED rows carry: {} (empty, ignored by existing frontend code)
-- -----------------------------------------------------------------------------
ALTER TABLE oip_signals
  ADD COLUMN IF NOT EXISTS scores jsonb NOT NULL DEFAULT '{}'::jsonb;


-- -----------------------------------------------------------------------------
-- 6. sam_subscriptions
--    One row per OIP that subscribes to the SAM vertical.
--    The subscription is binary (on/off) — NAICS codes, agency filters, and
--    deadline windows all live in the OIP's active profile JSON, not here.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sam_subscriptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  oip_id      uuid        NOT NULL REFERENCES oips(id) ON DELETE CASCADE,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (oip_id)   -- one subscription record per OIP
);

-- RLS -------------------------------------------------------------------------
ALTER TABLE sam_subscriptions ENABLE ROW LEVEL SECURITY;

-- Members can read their own tenant's SAM subscriptions (via oips → tenants)
CREATE POLICY "sam_subscriptions_select"
  ON sam_subscriptions
  FOR SELECT
  USING (
    oip_id IN (
      SELECT o.id FROM oips o
      JOIN tenant_members tm ON tm.tenant_id = o.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Only owners and admins can insert/update/delete
CREATE POLICY "sam_subscriptions_write"
  ON sam_subscriptions
  FOR ALL
  USING (
    oip_id IN (
      SELECT o.id FROM oips o
      JOIN tenant_members tm ON tm.tenant_id = o.tenant_id
      WHERE tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );


-- -----------------------------------------------------------------------------
-- 7. tenant_api_keys
--    Stores a reference into Supabase Vault (pgsodium) for each tenant's
--    per-vertical API key.  The plaintext key is NEVER stored in this table —
--    only the vault_secret_id UUID that resolves to the secret via:
--      SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = vault_secret_id
--    That query requires service role; the frontend sees only key_hint + expiry.
--
--    Prerequisites:
--      • Vault extension must be enabled: Dashboard → Database → Extensions → pgsodium / vault
--      • The `save-api-key` Edge Function handles vault.create_secret() writes
--        and upserts rows here; the frontend never calls this table directly.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_api_keys (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vertical_id     uuid        NOT NULL REFERENCES verticals(id),
  vault_secret_id uuid        NOT NULL,   -- references vault.secrets(id)
  key_hint        text        NOT NULL,   -- masked display: "SAM-87df...acd"
  expires_at      timestamptz,            -- set to created_at + 90 days for SAM keys
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, vertical_id)         -- one active key per tenant per vertical
);

-- RLS -------------------------------------------------------------------------
ALTER TABLE tenant_api_keys ENABLE ROW LEVEL SECURITY;

-- Members can read hint + expiry for their own tenant (never vault_secret_id)
-- Note: the frontend query should SELECT id, key_hint, expires_at, updated_at
-- and never request vault_secret_id.
CREATE POLICY "tenant_api_keys_select"
  ON tenant_api_keys
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid()
    )
  );

-- Only owners and admins can write (via Edge Function — this policy is a
-- defence-in-depth backstop; the Edge Function uses service role anyway)
CREATE POLICY "tenant_api_keys_write"
  ON tenant_api_keys
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );


-- -----------------------------------------------------------------------------
-- Verify (run these manually after applying to confirm the migration landed)
-- -----------------------------------------------------------------------------
-- SELECT slug, name FROM verticals ORDER BY slug;
-- SELECT column_name, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name IN ('signals', 'oip_signals')
--   ORDER BY table_name, ordinal_position;
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
-- SELECT indexname FROM pg_indexes WHERE tablename = 'signals';
