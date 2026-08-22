// src/components/signals/ScoreExplainBadge.jsx
//
// Click-to-expand breakdown of a composite_score (Stage+Scale+Corroboration),
// written by board_enrich_handler.py into oip_signals.board_enrichment.
// composite_score. Added 2026-08-22 alongside the deterministic scoring
// replacement for signal_score/profile_fit/scoreSignalRow.
//
// Deliberately dumb/presentational: takes the composite_score object
// directly and only renders it. A/B/C are computed ONCE, server-side, in
// compute_composite_score() (workers/sled/board_enrich_handler.py) — this
// component never reimplements the scoring formula. That duplication is
// exactly what produced the profile_fit vs scoreSignalRow drift found
// 2026-08-22 (two independent, disagreeing scoring mechanisms); keeping
// this component formula-free avoids repeating that mistake on the display
// side.
import React, { useState } from "react";

export default function ScoreExplainBadge({ compositeScore, badgeStyle }) {
  const [open, setOpen] = useState(false);
  if (!compositeScore) return null;

  const { total, A_stage, A_label, B_scale, B_label, C_corroboration, C_facts } = compositeScore;

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span
        style={{ ...badgeStyle, cursor: "pointer", textDecoration: "underline dotted" }}
        onClick={(ev) => { ev.stopPropagation(); setOpen((o) => !o); }}
        title="Click to see how this score is computed"
      >
        {total}
      </span>
      {open && (
        <div
          onClick={(ev) => ev.stopPropagation()}
          style={{
            position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 50,
            background: "var(--paper)", border: "2px solid var(--rule)", borderRadius: 4,
            padding: "12px 14px", width: 320, fontSize: 13, lineHeight: 1.5,
            fontFamily: "'IBM Plex Mono', monospace", boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>
            Score: {total} / 100
          </div>
          <div style={{ marginBottom: 4 }}>{A_label}</div>
          <div style={{ marginBottom: 4 }}>{B_label}</div>
          <div style={{ marginBottom: 4 }}>
            Corroboration: {C_corroboration > 0 ? `+${C_corroboration}` : "+0"}
          </div>
          {C_facts && C_facts.length > 0 && (
            <ul style={{ margin: "4px 0 0 0", paddingLeft: 18, color: "var(--ink-fade)" }}>
              {C_facts.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
          <div style={{
            marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--rule)",
            fontSize: 11, color: "var(--ink-fade)",
          }}>
            {A_stage} (Stage) + {B_scale} (Scale) + {C_corroboration} (Corroboration) = {total}
          </div>
          <button
            onClick={(ev) => { ev.stopPropagation(); setOpen(false); }}
            style={{ marginTop: 8, fontSize: 11, padding: "2px 8px" }}
          >
            Close
          </button>
        </div>
      )}
    </span>
  );
}
