-- 013_pursued_owner.sql
-- Owner on pursued items, plus member names for the Pursued table.
--
-- pursued_by  who clicked Pursue (kept as-is)
-- owner       who owns the pursuit now; defaults to pursued_by, reassignable
--
-- Run each statement individually and confirm with the SELECT at the end.

-- 1. Owner column
ALTER TABLE public.pursued_signals
  ADD COLUMN IF NOT EXISTS owner uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Backfill: owner = whoever pursued it
UPDATE public.pursued_signals SET owner = pursued_by WHERE owner IS NULL AND pursued_by IS NOT NULL;

-- 3. On insert: pursued_by defaults to the signed-in user, owner to pursued_by.
--    The frontend insert paths (Market Review, Derived Demand) set neither.
CREATE OR REPLACE FUNCTION public.pursued_signals_set_owner()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.pursued_by := COALESCE(NEW.pursued_by, auth.uid());
  NEW.owner      := COALESCE(NEW.owner, NEW.pursued_by);
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS pursued_signals_set_owner ON public.pursued_signals;
CREATE TRIGGER pursued_signals_set_owner
  BEFORE INSERT ON public.pursued_signals
  FOR EACH ROW EXECUTE FUNCTION public.pursued_signals_set_owner();

-- 4. Member emails for the Owner column. auth.users is not readable from the
--    browser, so this SECURITY DEFINER function returns emails only for a
--    tenant the caller belongs to.
CREATE OR REPLACE FUNCTION public.get_tenant_member_emails(p_tenant_id uuid)
RETURNS TABLE (user_id uuid, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT tm.user_id, u.email::text
  FROM public.tenant_members tm
  JOIN auth.users u ON u.id = tm.user_id
  WHERE tm.tenant_id = p_tenant_id
    AND EXISTS (SELECT 1 FROM public.tenant_members me
                WHERE me.tenant_id = p_tenant_id AND me.user_id = auth.uid())
  ORDER BY u.email;
$fn$;

REVOKE ALL ON FUNCTION public.get_tenant_member_emails(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_tenant_member_emails(uuid) TO authenticated;

-- Confirm
SELECT COUNT(*) AS pursued, COUNT(owner) AS with_owner, COUNT(pursued_by) AS with_pursued_by
FROM public.pursued_signals;
