-- =============================================================================
-- Migration 009 — SAM API key encryption (pgcrypto, no Vault)
-- =============================================================================
-- Vault is not available on this Supabase tier. This migration:
--   1. Swaps vault_secret_id (Vault reference) for key_encrypted (pgcrypto ciphertext)
--      on tenant_api_keys — the table was just created in 008 with no data yet
--   2. Creates encrypt_api_key() — called by the save-api-key Edge Function
--   3. Creates decrypt_api_key() — called by the Python worker (service role only)
--
-- Encryption scheme: pgp_sym_encrypt / pgp_sym_decrypt (AES-256 via pgcrypto)
-- Passphrase: stored as a Supabase secret (OIP_ENCRYPTION_KEY) and passed in
--             by the caller — never hardcoded here.
--
-- Note: pgcrypto is installed in the `extensions` schema on Supabase.
--       search_path must include extensions for pgp_sym_* to resolve.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Swap vault_secret_id → key_encrypted on tenant_api_keys
--    Safe: table was created in 008, no rows exist yet.
-- -----------------------------------------------------------------------------
ALTER TABLE tenant_api_keys
  DROP COLUMN vault_secret_id;

ALTER TABLE tenant_api_keys
  ADD COLUMN key_encrypted text NOT NULL DEFAULT '';

ALTER TABLE tenant_api_keys
  ALTER COLUMN key_encrypted DROP DEFAULT;


-- -----------------------------------------------------------------------------
-- 2. encrypt_api_key(plaintext, passphrase) → text
--    Called by the save-api-key Edge Function.
--    Returns base64-encoded pgp_sym_encrypt output (safe for text storage).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION encrypt_api_key(plaintext text, passphrase text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT encode(
    pgp_sym_encrypt(plaintext, passphrase)::bytea,
    'base64'
  );
$$;

REVOKE ALL ON FUNCTION encrypt_api_key(text, text) FROM PUBLIC;


-- -----------------------------------------------------------------------------
-- 3. decrypt_api_key(ciphertext, passphrase) → text
--    Called by the Python worker (service role) to retrieve the plaintext key.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION decrypt_api_key(ciphertext text, passphrase text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT pgp_sym_decrypt(
    decode(ciphertext, 'base64')::bytea,
    passphrase
  );
$$;

REVOKE ALL ON FUNCTION decrypt_api_key(text, text) FROM PUBLIC;


-- -----------------------------------------------------------------------------
-- Verify
-- -----------------------------------------------------------------------------
-- SELECT column_name, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'tenant_api_keys'
--   ORDER BY ordinal_position;
--
-- SELECT proname, prosecdef
--   FROM pg_proc
--   WHERE proname IN ('encrypt_api_key', 'decrypt_api_key');
