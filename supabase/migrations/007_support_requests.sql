-- =====================================================================
-- 007_support_requests.sql
-- =====================================================================
-- Inbound help/feedback requests from users. Captures the message,
-- user identity, current page URL, and tenant/OIP context. The
-- support-email Edge Function reads recent rows and emails the operator.
-- =====================================================================

begin;

create table if not exists support_requests (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid references auth.users(id) on delete set null,
    user_email      text,                            -- denormalized at insert time
    tenant_id       uuid references tenants(id) on delete set null,
    tenant_name     text,                            -- denormalized
    oip_id          uuid references oips(id) on delete set null,
    oip_name        text,                            -- denormalized
    page_url        text,                            -- the page they were on when they submitted
    message         text not null,
    status          text not null default 'open' check (status in ('open','triaged','responded','closed')),
    operator_notes  text,
    created_at      timestamptz not null default now(),
    responded_at    timestamptz
);

create index if not exists support_requests_status_idx
    on support_requests (status, created_at desc);
create index if not exists support_requests_user_idx
    on support_requests (user_id);

alter table support_requests enable row level security;

-- Users can insert their own requests
create policy support_requests_insert on support_requests
    for insert to authenticated
    with check (user_id = auth.uid());

-- Users can read their own requests (so they can confirm submission)
create policy support_requests_self_read on support_requests
    for select to authenticated
    using (user_id = auth.uid());

-- (Operator/admin tools query via service_role and bypass RLS.)

commit;
