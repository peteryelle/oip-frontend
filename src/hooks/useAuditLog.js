// src/hooks/useAuditLog.js
//
// Reads the immutable audit_log. RLS already scopes rows to tenants the caller
// belongs to; pass a tenantId (Activity-log page) or table+recordId (per-record
// history in a drawer) to narrow further. Read-only — there is no write path.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useAuditLog({ tenantId = null, table = null, recordId = null, limit = 200 } = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    // Require at least one scope so we never pull an unbounded feed.
    if (!tenantId && !(table && recordId)) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    let q = supabase
      .from("audit_log")
      .select(
        "id, tenant_id, oip_id, table_name, record_id, action, field, old_value, new_value, actor_email, changed_at"
      )
      .order("changed_at", { ascending: false })
      .limit(limit);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    if (table) q = q.eq("table_name", table);
    if (recordId) q = q.eq("record_id", recordId);

    const { data, error } = await q;
    if (error) {
      setError(error);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }, [tenantId, table, recordId, limit]);

  useEffect(() => {
    load();
  }, [load]);

  return { rows, loading, error, refetch: load };
}
