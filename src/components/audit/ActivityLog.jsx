// src/components/audit/ActivityLog.jsx
//
// Tenant-wide change feed for the Settings → Activity page. Reads the immutable
// audit_log (human edits only). Visible to every team member; deliberately has
// NO edit or delete control.
import React, { useMemo, useState } from "react";
import { useAuditLog } from "../../hooks/useAuditLog";

const th = {
  padding: "8px 10px",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: ".08em",
  color: "var(--ink-fade)",
  fontFamily: "'IBM Plex Mono', monospace",
};
const td = { padding: "10px", fontSize: 13, verticalAlign: "top", borderBottom: "1px solid var(--rule)" };

const LABELS = {
  oip_signals: "Signal",
  profiles: "Profile",
  sentinels: "Sentinel",
  sentinel_keywords: "Sentinel keyword",
  pursued_signals: "Pursuit",
  oips: "OIP",
  oip_subscriptions: "Subscription",
  sam_subscriptions: "Subscription",
};

function val(v) {
  if (v == null || v === "") return <span style={{ color: "var(--ink-fade)" }}>—</span>;
  const s = String(v);
  return s.length > 140 ? s.slice(0, 140) + "…" : s;
}

export default function ActivityLog({ tenantId, tenantName }) {
  const [tableFilter, setTableFilter] = useState("");
  const { rows, loading, error } = useAuditLog({ tenantId, limit: 300 });

  const tables = useMemo(() => Array.from(new Set(rows.map((r) => r.table_name))), [rows]);
  const filtered = tableFilter ? rows.filter((r) => r.table_name === tableFilter) : rows;

  return (
    <div className="detail-section">
      <div className="detail-eyebrow">Activity log{tenantName ? ` · ${tenantName}` : ""}</div>
      <h2 className="detail-title">Activity log</h2>
      <p style={{ color: "var(--ink-fade)", fontSize: 13, marginTop: -4, maxWidth: 620 }}>
        Every field change made by a team member, with who and when. Visible to everyone on the
        team; this record is append-only and can&rsquo;t be edited or deleted.
      </p>

      <div className="top10-controls" style={{ marginBottom: 16 }}>
        <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)}>
          <option value="">All record types</option>
          {tables.map((t) => (
            <option key={t} value={t}>
              {LABELS[t] || t}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ color: "var(--ink-fade)" }}>Loading…</div>
      ) : error ? (
        <div style={{ color: "var(--ink-fade)" }}>
          Couldn&rsquo;t load activity: {String(error.message || error)}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "var(--ink-fade)" }}>No changes recorded yet.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--rule)", textAlign: "left" }}>
              <th style={th}>When</th>
              <th style={th}>Who</th>
              <th style={th}>Record</th>
              <th style={th}>Change</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{new Date(r.changed_at).toLocaleString()}</td>
                <td style={td}>
                  <span className="blurable">{r.actor_email || "—"}</span>
                </td>
                <td style={td}>{LABELS[r.table_name] || r.table_name}</td>
                <td style={td}>
                  {r.action === "update" ? (
                    <>
                      <code style={{ fontSize: 12 }}>{r.field}</code>: {val(r.old_value)}{" "}
                      <span style={{ color: "var(--ink-fade)" }}>→</span> <strong>{val(r.new_value)}</strong>
                    </>
                  ) : (
                    <em style={{ color: "var(--ink-fade)" }}>{r.action}</em>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
