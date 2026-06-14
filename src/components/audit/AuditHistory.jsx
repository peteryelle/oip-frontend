// src/components/audit/AuditHistory.jsx
//
// Compact per-record change history for a detail drawer. Reads the immutable
// audit_log scoped to one record (table + record_id). Renders nothing when the
// record has no recorded human edits. Read-only.
import React from "react";
import { useAuditLog } from "../../hooks/useAuditLog";

export default function AuditHistory({ table, recordId, title = "Change history" }) {
  const { rows, loading } = useAuditLog({ table, recordId, limit: 50 });

  if (loading || !rows.length) return null;

  return (
    <div style={{ marginTop: 20, borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: ".1em",
          color: "var(--ink-fade)",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {rows.map((r) => (
          <li
            key={r.id}
            style={{ fontSize: 12.5, padding: "7px 0", borderBottom: "1px solid var(--rule)" }}
          >
            <span style={{ color: "var(--ink-fade)" }}>{new Date(r.changed_at).toLocaleString()}</span>
            {" · "}
            <span className="blurable">{r.actor_email || "—"}</span>
            <div style={{ marginTop: 2 }}>
              {r.action === "update" ? (
                <>
                  <code style={{ fontSize: 11.5 }}>{r.field}</code>:{" "}
                  {r.old_value == null || r.old_value === "" ? "—" : r.old_value}{" "}
                  <span style={{ color: "var(--ink-fade)" }}>→</span>{" "}
                  <strong>{r.new_value == null || r.new_value === "" ? "—" : r.new_value}</strong>
                </>
              ) : (
                <em style={{ color: "var(--ink-fade)" }}>{r.action}</em>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
