// src/lib/scoreDisplay.js
//
// Shapes DD v2 SAM's already-computed scores (scores.size/urgency/timing/
// b2b_score, from dd_v2_brief_handler.py or dd_v2_capital_brief_handler.py)
// into the compositeScore contract ScoreExplainBadge expects. Deliberately
// formula-free -- same discipline ScoreExplainBadge.jsx's own docstring
// requires: this ONLY reformats numbers the backend already computed, it
// never recalculates a weight or threshold. Shared by both
// B2BBusDevReport.jsx (single-award detail view) and AwardTable.jsx (list
// view) so the two can't drift into disagreeing about the same award's
// breakdown -- the exact failure mode (profile_fit vs scoreSignalRow) that
// ScoreExplainBadge.jsx was built to avoid on 2026-08-22.

export function buildDDv2CompositeScore(scores, isCapitalBuild) {
  if (!scores || scores.b2b_score == null) return null;

  const sizePct = isCapitalBuild ? "25" : "40";
  const urgencyPct = isCapitalBuild ? "25" : "30";
  const timingPct = isCapitalBuild ? "50" : "30";

  return {
    total: scores.b2b_score,
    A_stage: scores.size != null ? Math.round(scores.size) : null,
    A_label: `Size (${sizePct}%): ${scores.size != null ? Math.round(scores.size) : "—"}/100`,
    B_scale: scores.urgency != null ? Math.round(scores.urgency) : null,
    B_label: `Urgency (${urgencyPct}%): ${scores.urgency != null ? Math.round(scores.urgency) : "—"}/100`,
    C_corroboration: scores.timing != null ? Math.round(scores.timing) : null,
    C_label: `Timing (${timingPct}%): ${scores.timing != null ? Math.round(scores.timing) : "—"}/100`,
    C_facts: [
      scores.deliverable != null
        ? `Deliverable (35% of size): ${scores.deliverable}/100${scores.deliverable_band ? ` — ${scores.deliverable_band}` : ""}`
        : null,
      scores.value != null
        ? `Contract value (65% of size): ${scores.value}/100${scores.value_note ? ` — ${scores.value_note}` : ""}`
        : null,
    ].filter(Boolean),
  };
}
