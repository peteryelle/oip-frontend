// src/components/awards/AwardTable.jsx
//
// Table view of B2B Bus Dev awards — mirrors the SAM notice table
// (SamOpportunityTable) so the two SAM tabs read the same way. Row click
// opens the existing B2BBusDevReport drawer. Self-contained: reuses only
// the wq- classes already defined in awards.css.
import React, { useMemo, useState } from "react";
import { awardTags } from "../../hooks/useAwards";
import ScoreExplainBadge from "../signals/ScoreExplainBadge";
import { buildDDv2CompositeScore } from "../../lib/scoreDisplay";

const DISPOSITION_CLASS = {
  Yes: "wq-disp-yes",
  Hold: "wq-disp-hold",
  "Route-B2G": "wq-disp-b2g",
  No: "wq-disp-no",
};
const DISPOSITION_ORDER = { Yes: 0, Hold: 1, "Route-B2G": 2, No: 3 };

const MOTION_LABEL = {
  own_infra: "Own infra",
  partner_integrate: "Partner",
  agency_owns: "Agency owns",
  unknown: "Unknown",
};

// delivery_mode from the entailment pass — how the incumbent performs this work
// today. Populated into `difficulty` by useAwards for recompete rows.
const DELIVERY_LABEL = {
  own_platform: "Own platform",
  outsourced: "Outsourced",
  manual: "Manual",
  unknown: "Unknown",
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
function fmtPopEnd(iso, daysToEnd, horizonDays) {
  if (!iso) return { date: "—", cls: "", months: null };
  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString(
    undefined,
    { month: "numeric", day: "numeric", year: "2-digit" }
  );
  let cls = "";
  let months = null;
  if (daysToEnd != null && daysToEnd >= 0) {
    months = Math.round(daysToEnd / 30.44);
    if (daysToEnd <= 90) cls = "wq-clock-hot";
    else if (daysToEnd <= horizonDays) cls = "wq-clock-warm";
  }
  return { date, cls, months };
}
const rankMonths = (m) => (m == null || m < 0 ? Number.POSITIVE_INFINITY : m);

// The collector stores signal title as "<PIID>: <SCOPE>", sometimes with
// IGF::XX::IGF inherently-governmental markers. Pull a clean short scope so two
// awards to the same prime are distinguishable at a glance.
function scopeFromTitle(title, piid) {
  if (!title) return "";
  let s = String(title);
  if (piid && s.startsWith(piid)) s = s.slice(piid.length);
  s = s
    .replace(/^[:\s-]+/, "")
    .replace(/IGF::[A-Z]{2}::IGF/gi, " ")
    .replace(/IGF::[A-Z]{2}::/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > 64) s = s.slice(0, 63).trimEnd() + "\u2026";
  return s;
}

export default function AwardTable({ awards, onRowClick, recompeteDays = 180, awardDays = 120 }) {
  const [sortKey, setSortKey] = useState("score");
  const [sortDir, setSortDir] = useState("desc");

  const getVal = (a, key) => {
    switch (key) {
      case "prime":       return (a.recipient || "").toLowerCase();
      case "amount":      return a.amount ?? -1;
      case "primeTotal":  return a.primeTotal ?? -1;
      case "recompete":   return rankMonths(a.monthsToPopEnd);
      case "disposition": return DISPOSITION_ORDER[a.disposition] ?? 9;
      case "score":
      default:            return a.score ?? -1;
    }
  };

  const sorted = useMemo(() => {
    const list = [...awards];
    list.sort((a, b) => {
      const av = getVal(a, sortKey);
      const bv = getVal(b, sortKey);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [awards, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      // amount/score/recompete default to most-useful direction
      setSortDir(key === "prime" ? "asc" : key === "recompete" ? "asc" : "desc");
    }
  };

  const SortTh = ({ label, k, right }) => (
    <th
      className={`wq-atable-th${right ? " wq-atable-r" : ""}${sortKey === k ? " is-sorted" : ""}`}
      onClick={() => toggleSort(k)}
    >
      {label} {sortKey === k ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <div className="wq-atable-wrap">
      <table className="wq-atable">
        <thead>
          <tr>
            <SortTh label="Prime" k="prime" />
            <th className="wq-atable-th">Agency</th>
            <SortTh label="Amount" k="amount" right />
            <SortTh label="Prime Total" k="primeTotal" right />
            <SortTh label="Recompete" k="recompete" />
            <SortTh label="B2B" k="score" />
            <SortTh label="Disposition" k="disposition" />
            <th className="wq-atable-th">Delivery</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((a) => {
            const pop = fmtPopEnd(a.popEnd, a.daysToPopEnd, recompeteDays);
            const scope = scopeFromTitle(a.title, a.piid);
            const t = awardTags(a, recompeteDays, awardDays);
            return (
              <tr key={a.signalId} className="wq-atable-row" onClick={() => onRowClick(a)}>
                <td className="wq-atable-td">
                  {/* Prime name links to the account page. Opens in a new tab and
                      stops propagation so the row's onRowClick does not also fire
                      and open the award drawer underneath. */}
                  {a.uei ? (
                    <a
                      href={`/prime/${a.uei}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="wq-atable-prime blurable"
                      style={{ color: "inherit", textDecoration: "none", borderBottom: "1px dotted #9ca3af" }}
                      title="Open account"
                    >
                      {a.recipient || "Unknown prime"}
                    </a>
                  ) : (
                    <div className="wq-atable-prime blurable">{a.recipient || "Unknown prime"}</div>
                  )}
                  {t.awardedNew && <span className="wq-chip wq-flag-new">New award</span>}
                  {scope && <div className="wq-atable-scope blurable">{scope}</div>}
                  <div className="wq-atable-sub blurable">
                    {a.piid && <span>{a.piid.slice(0, 22)}</span>}
                    {a.uei && <span>{a.uei}</span>}
                  </div>
                </td>
                <td className="wq-atable-td wq-atable-agency blurable">
                  {a.subAgency || a.agency || "—"}
                </td>
                <td className="wq-atable-td wq-atable-r wq-atable-amt">{fmtMoney(a.amount)}</td>
                <td className="wq-atable-td wq-atable-r wq-atable-amt">{fmtMoney(a.primeTotal)}</td>
                <td className="wq-atable-td">
                  {!t.active ? (
                    <span className="wq-atable-state wq-state-ended">Ended · {pop.date}</span>
                  ) : t.recompeteSoon ? (
                    <span className={`wq-chip ${pop.cls || "wq-clock-warm"}`}>
                      {pop.date}{pop.months != null ? ` · ${pop.months}mo` : ""}
                    </span>
                  ) : (
                    <span className="wq-atable-state wq-state-active">Outside window · {pop.date}</span>
                  )}
                </td>
                <td className="wq-atable-td">
                  {a.gated ? (
                    <span className="wq-chip wq-score-na" title="Rejected at the entailment gate">
                      —
                    </span>
                  ) : (() => {
                    const isCapitalBuild = a.motion === "capital_build";
                    const compositeScore = buildDDv2CompositeScore(a.busdev?.scores, isCapitalBuild);
                    return compositeScore ? (
                      <ScoreExplainBadge
                        compositeScore={compositeScore}
                        badgeStyle={{}}
                        labelA="Size" labelB="Urgency" labelC="Timing"
                        className={`wq-chip ${scoreBand(a.score)}`}
                      />
                    ) : (
                      <span className={`wq-chip ${scoreBand(a.score)}`}>
                        {a.score ?? "—"}
                      </span>
                    );
                  })()}
                </td>
                <td className="wq-atable-td">
                  {a.disposition ? (
                    <span className={`wq-chip ${DISPOSITION_CLASS[a.disposition] || ""}`}>
                      {a.disposition}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="wq-atable-td wq-atable-motion">
                  {DELIVERY_LABEL[a.difficulty] ||
                    (a.motion ? MOTION_LABEL[a.motion] || a.motion : "—")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
