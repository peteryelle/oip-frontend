// src/components/awards/AwardCard.jsx
import React from "react";

const DISPOSITION_CLASS = {
  Yes: "wq-disp-yes",
  Hold: "wq-disp-hold",
  "Route-B2G": "wq-disp-b2g",
  No: "wq-disp-no",
};

function scoreBand(score) {
  if (score == null) return "wq-score-na";
  if (score >= 75) return "wq-score-high";
  if (score >= 50) return "wq-score-mid";
  return "wq-score-low";
}

function fmtMoney(n) {
  if (n == null) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

function recompete(months) {
  if (months == null || months < 0) return null;
  if (months <= 9) return { label: `recompete ${months}mo`, cls: "wq-clock-hot" };
  if (months <= 18) return { label: `recompete ${months}mo`, cls: "wq-clock-warm" };
  return null;
}

export default function AwardCard({ award, onOpen }) {
  const clock = recompete(award.monthsToPopEnd);
  const teaser = award.whyNow || award.busdev?.positioning?.pitch || "";

  return (
    <button type="button" className="wq-award-card" onClick={() => onOpen?.(award)}>
      <div className="wq-award-top">
        <span className={`wq-score ${scoreBand(award.score)}`}>{award.score ?? "—"}</span>
        <div className="wq-award-head">
          <div className="wq-award-recipient">{award.recipient || "Unknown prime"}</div>
          <div className="wq-award-meta">
            {award.agency}
            {award.subAgency ? ` · ${award.subAgency}` : ""} · {fmtMoney(award.amount)}
          </div>
        </div>
      </div>

      <div className="wq-chips">
        {award.disposition && (
          <span className={`wq-chip ${DISPOSITION_CLASS[award.disposition] || ""}`}>
            {award.disposition}
          </span>
        )}
        {award.motion && <span className="wq-chip wq-chip-soft">{award.motion}</span>}
        {award.difficulty && (
          <span className="wq-chip wq-chip-soft">displace: {award.difficulty}</span>
        )}
        {clock && <span className={`wq-chip ${clock.cls}`}>{clock.label}</span>}
      </div>

      {teaser && <div className="wq-award-teaser">{teaser}</div>}
    </button>
  );
}
