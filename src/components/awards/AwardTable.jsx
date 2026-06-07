// src/components/awards/AwardTable.jsx
//
// Table view of B2B Bus Dev awards — mirrors the SAM notice table
// (SamOpportunityTable) so the two SAM tabs read the same way. Row click
// opens the existing B2BBusDevReport drawer. Self-contained: reuses only
// the wq- classes already defined in awards.css.
import React, { useMemo, useState } from "react";

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
function fmtPopEnd(iso, months) {
  if (!iso) return { date: "—", cls: "" };
  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString(
    undefined,
    { month: "numeric", day: "numeric", year: "2-digit" }
  );
  let cls = "";
  if (months != null && months >= 0) {
    if (months <= 9) cls = "wq-clock-hot";
    else if (months <= 18) cls = "wq-clock-warm";
  }
  return { date, cls, months };
}
const rankMonths = (m) => (m == null || m < 0 ? Number.POSITIVE_INFINITY : m);

export default function AwardTable({ awards, onRowClick }) {
  const [sortKey, setSortKey] = useState("score");
  const [sortDir, setSortDir] = useState("desc");

  const getVal = (a, key) => {
    switch (key) {
      case "prime":       return (a.recipient || "").toLowerCase();
      case "amount":      return a.amount ?? -1;
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
            <SortTh label="Recompete" k="recompete" />
            <SortTh label="B2B" k="score" />
            <SortTh label="Disposition" k="disposition" />
            <th className="wq-atable-th">Motion</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((a) => {
            const pop = fmtPopEnd(a.popEnd, a.monthsToPopEnd);
            return (
              <tr key={a.signalId} className="wq-atable-row" onClick={() => onRowClick(a)}>
                <td className="wq-atable-td">
                  <div className="wq-atable-prime">{a.recipient || "Unknown prime"}</div>
                  <div className="wq-atable-sub">
                    {a.piid && <span>{a.piid.slice(0, 22)}</span>}
                    {a.uei && <span>{a.uei}</span>}
                  </div>
                </td>
                <td className="wq-atable-td wq-atable-agency">
                  {a.subAgency || a.agency || "—"}
                </td>
                <td className="wq-atable-td wq-atable-r wq-atable-amt">{fmtMoney(a.amount)}</td>
                <td className="wq-atable-td">
                  {pop.cls ? (
                    <span className={`wq-chip ${pop.cls}`}>
                      {pop.date}{pop.months != null ? ` · ${pop.months}mo` : ""}
                    </span>
                  ) : (
                    <span className="wq-atable-sub-inline">{pop.date}</span>
                  )}
                </td>
                <td className="wq-atable-td">
                  <span className={`wq-score wq-score-sm ${scoreBand(a.score)}`}>
                    {a.score ?? "—"}
                  </span>
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
                  {a.motion ? MOTION_LABEL[a.motion] || a.motion : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
