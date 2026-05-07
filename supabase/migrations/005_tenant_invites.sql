-- =====================================================================
-- 005_tenant_invites.sql
-- =====================================================================
-- Tenant invitation flow: admins invite teammates by email; invitee
-- receives a magic link, lands on accept-invite, sets a password, gets
-- their tenant_members row created.
--
-- Apply after 004_worker_schema_updates.sql.
-- =====================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────
-- Table: invites
-- ─────────────────────────────────────────────────────────────────────

create table if not exists tenant_invites (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references tenants(id) on delete cascade,
    email           text not null,
    role            text not null check (role in ('owner','admin','member','viewer')),
    token           text unique not null,
    invited_by      uuid references auth.users(id),
    invited_at      timestamptz not null default now(),
    expires_at      timestamptz not null default (now() + interval '14 days'),
    accepted_at     timestamptz,
    accepted_by     uuid references auth.users(id)
);

create index if not exists tenant_invites_tenant_idx on tenant_invites (tenant_id);
create index if not exists tenant_invites_email_idx
    on tenant_invites (email) where accepted_at is null;
create index if not exists tenant_invites_token_idx on tenant_invites (token);

alter table tenant_invites enable row level security;

-- Tenant admins can read invites for their tenant
create policy invites_admin_read on tenant_invites
    for select to authenticated using (is_tenant_admin(tenant_id));

-- Anyone can read their own invite by token (used by accept page);
-- enforced via the create_tenant_invite + claim_tenant_invite RPCs which
-- run with security definer.

-- ─────────────────────────────────────────────────────────────────────
-- Function: create_tenant_invite
-- Called by tenant admin from the frontend. Returns the invite id.
-- The frontend invokes the invite-email Edge Function next, passing
-- this id so it can fetch + send.
-- ─────────────────────────────────────────────────────────────────────

create or replace function create_tenant_invite(
    p_tenant_id uuid,
    p_email     text,
    p_role      text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_token   text;
    v_invite  uuid;
begin
    -- Authorization: caller must be admin/owner of tenant
    if not is_tenant_admin(p_tenant_id) then
        raise exception 'Not authorized to invite to tenant %', p_tenant_id;
    end if;

    -- Validate role
    if p_role not in ('admin','member','viewer') then
        raise exception 'Invalid role: %', p_role;
    end if;

    -- Lowercase email
    p_email := lower(trim(p_email));
    if p_email !~ '^[^@]+@[^@]+\.[^@]+$' then
        raise exception 'Invalid email: %', p_email;
    end if;

    -- Don't double-invite the same email to same tenant
    if exists (
        select 1 from tenant_invites
        where tenant_id = p_tenant_id and email = p_email and accepted_at is null
              and expires_at > now()
    ) then
        raise exception 'Pending invite already exists for %', p_email;
    end if;

    -- Random token (64 hex chars)
    v_token := encode(gen_random_bytes(32), 'hex');

    insert into tenant_invites (tenant_id, email, role, token, invited_by)
    values (p_tenant_id, p_email, p_role, v_token, auth.uid())
    returning id into v_invite;

    return v_invite;
end;
$$;

revoke all on function create_tenant_invite from public;
grant execute on function create_tenant_invite to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- Function: claim_tenant_invite
-- Called by the invitee from the accept-invite page after they've signed
-- in via magic link. Uses the token from the URL.
-- ─────────────────────────────────────────────────────────────────────

create or replace function claim_tenant_invite(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_invite tenant_invites%rowtype;
    v_user_email text;
begin
    if auth.uid() is null then
        raise exception 'Must be signed in to claim invite';
    end if;

    select email into v_user_email from auth.users where id = auth.uid();

    select * into v_invite from tenant_invites where token = p_token;
    if v_invite is null then
        raise exception 'Invite not found';
    end if;
    if v_invite.accepted_at is not null then
        raise exception 'Invite already accepted';
    end if;
    if v_invite.expires_at < now() then
        raise exception 'Invite expired';
    end if;
    if lower(v_user_email) != lower(v_invite.email) then
        raise exception 'Invite is for % but you are signed in as %',
            v_invite.email, v_user_email;
    end if;

    -- Insert membership (idempotent)
    insert into tenant_members (tenant_id, user_id, role)
    values (v_invite.tenant_id, auth.uid(), v_invite.role)
    on conflict (tenant_id, user_id) do update set role = excluded.role;

    -- Mark invite consumed
    update tenant_invites
    set accepted_at = now(),
        accepted_by = auth.uid()
    where id = v_invite.id;
end;
$$;

revoke all on function claim_tenant_invite from public;
grant execute on function claim_tenant_invite to authenticated;

commit;
