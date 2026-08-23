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
//
// GENERALIZED for DD v2 SAM reuse (Size/Urgency/Timing composite, both
// recompete and capital-build motions) via labelA/labelB/labelC props.
// Defaults are the ORIGINAL hardcoded Stage/Scale/Corroboration strings --
// existing Tessco SLED-boards callers that don't pass these props render
// byte-for-byte identically to before. Callers passing their own labels
// (e.g. "Size"/"Urgency"/"Timing") get correct text instead of this
// component silently mislabeling a different formula as Stage/Scale/
// Corroboration -- the same class of bug already found and fixed once
// this session in B2BBusDevReport.jsx's motion-blind scoring labels.
import React, { useState } from "react";

export default function ScoreExplainBadge({
  compositeScore, badgeStyle, className = "",
  labelA = "Stage", labelB = "Scale", labelC = "Corroboration",
}) {
  const [open, setOpen] = useState(false);
  if (!compositeScore) return null;

  const { total, A_stage, A_label, B_scale, B_label, C_corroboration, C_label, C_facts } = compositeScore;

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span
        className={className}
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
            padding: "10px 16px", width: 460, fontSize: 13, lineHeight: 1.4,
            fontFamily: "'IBM Plex Mono', monospace", boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>
            Score: {total} / 100
          </div>
          {/* Three components in one row, not three stacked lines --
              widening the popup buys back the vertical space this saves. */}
          <div style={{ display: "flex", gap: 14, marginBottom: 6, flexWrap: "wrap" }}>
            <span>{A_label}</span>
            <span>{B_label}</span>
            <span>{C_label || `${labelC}: ${C_corroboration}`}</span>
          </div>
          {C_facts && C_facts.length > 0 && (
            <ul style={{ margin: "2px 0 0 0", paddingLeft: 16, color: "var(--ink-fade)" }}>
              {C_facts.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
          <div style={{
            marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--rule)",
            fontSize: 11, color: "var(--ink-fade)",
          }}>
            {A_stage} ({labelA}) + {B_scale} ({labelB}) + {C_corroboration} ({labelC}) = {total}
          </div>
          <button
            onClick={(ev) => { ev.stopPropagation(); setOpen(false); }}
            style={{ marginTop: 6, fontSize: 11, padding: "2px 8px" }}
          >
            Close
          </button>
        </div>
      )}
    </span>
  );
}
