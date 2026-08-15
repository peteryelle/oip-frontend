CREATE TABLE cable_targets (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    -- identity
    uei                 text NOT NULL UNIQUE,
    company_name        text NOT NULL,
    naics_code          text,
    naics_description   text,

    -- award activity
    award_count         int NOT NULL DEFAULT 0,
    prime_count         int NOT NULL DEFAULT 0,
    total_award_value   numeric(12,2) NOT NULL DEFAULT 0,
    prime_ueis          text[],
    prime_names         text[],

    -- top award detail
    top_award_id        text,
    top_award_amount    numeric(12,2),
    top_award_date      date,
    top_award_description text,
    top_awarding_agency text,
    top_awarding_sub_agency text,

    -- agency x naics cell
    cell_agency         text,
    cell_naics          text,
    cell_priority       int,

    -- scoring
    score               int,
    score_cell          int DEFAULT 0,
    score_activity      int DEFAULT 0,
    score_keywords      int DEFAULT 0,
    score_amount        int DEFAULT 0,

    -- disposition
    disposition         text CHECK (disposition IN ('HOT', 'WARM', 'COLD')),
    zero_award          boolean NOT NULL DEFAULT false,

    -- stage 2 prime check
    prime_check_run     boolean NOT NULL DEFAULT false,
    prime_check_at      timestamptz,
    disqualified        boolean NOT NULL DEFAULT false,
    disqualify_reason   text,

    -- optional LLM enrichment
    llm_enriched        boolean NOT NULL DEFAULT false,
    llm_enriched_at     timestamptz,
    federal_focus_confirmed boolean,
    named_primes_on_website boolean,
    has_bd_staff        boolean,
    recent_win_announced boolean,
    uses_govcon_tool    boolean,
    evidence_notes      text,

    -- run tracking
    pull_run_id         text,
    pull_run_at         timestamptz
);

CREATE INDEX cable_targets_disposition_idx ON cable_targets (disposition);
CREATE INDEX cable_targets_score_idx ON cable_targets (score DESC);
CREATE INDEX cable_targets_uei_idx ON cable_targets (uei);

ALTER TABLE cable_targets ENABLE ROW LEVEL SECURITY;
