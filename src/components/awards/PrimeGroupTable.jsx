// src/components/awards/PrimeGroupTable.jsx
//
// "Primes" view of the Derived Demand (B2B Bus Dev) tab — the DD equivalent of
// SLED's Entities tab. Groups the awards the tab is ALREADY showing (every
// filter, search and the busdev_display_limit cap applied upstream) by the
// prime that won them. Client-side only: no query, no RPC, no LLM.
//
// Grouping key: UEI, falling back to the normalized prime name when a row has
// no UEI. The prime name links to /prime/:uei (PrimeAccountPage), same as the
// Prime column in AwardTable. Expanding a prime lists its contracts in the
// existing AwardTable, so the brief drawer, status and pursue are unchanged.
//
// Mixed scoring: when some shown rows carry a gap-fit band and others do not,
// a banner says so — best-Fit ranking across the two methods is not like for
// like (see "no mixed DD rankings", Nov 9 2026).
import React, { useMemo, useState } from "react";
import AwardTable from "./AwardTable";

const GAP_LABEL = {
  evidenced: "Evidenced gap",
  plausible: "Plausible gap",
  unknown: "Gap unknown",
  no_gap: "No gap",
};
const GAP_RANK = { evidenced: 3, plausible: 2, unknown: 1, no_gap: 0 };
const DISP_ORDER = ["Yes", "Hold", "Route-B2G", "No"];
const DISPOSITION_CLASS = {
  Yes: "wq-disp-yes",
  Hold: "wq-disp-hold",
  "Route-B2G": "wq-disp-b2g",
  No: "wq-disp-no",
};

function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(inc|llc|l l c|corp|corporation|co|company|ltd|lp|llp|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
  return `$${Math.round(n)}`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "numeric", day: "numeric", year: "2-digit", timeZone: "UTC",
  });
}

function vendorLine(gf) {
  if (!gf) return null;
  if (gf.tech_evidence === "competitor_in_use" || gf.tech_evidence === "other_vendor_in_use")
    return gf.vendor_named ? `Works with ${gf.vendor_named}` : null;
  if (gf.tech_evidence === "relationship_only")
    return gf.vendor_named ? `Relationship with ${gf.vendor_named}` : null;
  return null;
}

export function primeKey(a) {
  return a.uei ? `uei:${a.uei}` : `name:${normName(a.recipient) || "unknown"}`;
}

function groupByPrime(awards) {
  const map = new Map();
  for (const a of awards) {
    const key = primeKey(a);
    if (!map.has(key)) {
      map.set(key, {
        key,
        uei: a.uei || "",
        name: a.recipient || "Unknown prime",
        awards: [],
        total: 0,
        bestScore: null,
        bestBand: null,
        nearestEnd: null,
        nearestDays: null,
        allEnded: true,
        disp: {},
        vendor: null,
      });
    }
    const g = map.get(key);
    g.awards.push(a);
    if (a.amount != null) g.total += a.amount;
    if (!a.gated && a.score != null && (g.bestScore == null || a.score > g.bestScore)) g.bestScore = a.score;
    const band = a.busdev?.gap_fit?.band;
    if (band && (g.bestBand == null || (GAP_RANK[band] ?? -1) > (GAP_RANK[g.bestBand] ?? -1))) g.bestBand = band;
    if (a.daysToPopEnd == null || a.daysToPopEnd >= 0) {
      g.allEnded = false;
      if (a.daysToPopEnd != null && (g.nearestDays == null || a.daysToPopEnd < g.nearestDays)) {
        g.nearestDays = a.daysToPopEnd;
        g.nearestEnd = a.popEnd;
      }
    }
    if (a.disposition) g.disp[a.disposition] = (g.disp[a.disposition] || 0) + 1;
    if (!g.vendor) g.vendor = vendorLine(a.busdev?.gap_fit);
  }
  return Array.from(map.values());
}

const SORTERS = {
  score: (a, b) => (b.bestScore ?? -1) - (a.bestScore ?? -1),
  amount: (a, b) => b.total - a.total,
  recompete: (a, b) =>
    (a.nearestDays ?? Number.POSITIVE_INFINITY) - (b.nearestDays ?? Number.POSITIVE_INFINITY),
};

export default function PrimeGroupTable({ awards, sort = "recompete", onRowClick, recompeteDays = 180, awardDays = 120 }) {
  const [open, setOpen] = useState(() => new Set());

  const groups = useMemo(() => {
    const list = groupByPrime(awards);
    const cmp = SORTERS[sort] || SORTERS.score;
    list.sort((a, b) => cmp(a, b) || a.name.localeCompare(b.name));
    return list;
  }, [awards, sort]);

  const mixed = useMemo(() => {
    const scored = awards.filter((a) => !a.gated);
    const withBand = scored.filter((a) => a.busdev?.gap_fit?.band).length;
    return withBand > 0 && withBand < scored.length;
  }, [awards]);

  const toggle = (key) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="wq-atable-wrap">
      {mixed && (
        <div className="wq-awards-empty" style={{ marginBottom: 12 }}>
          Some contracts here have a gap rating and some do not yet, so Fit is not
          comparable across every prime until the next scoring run completes.
        </div>
      )}
      <table className="wq-atable">
        <thead>
          <tr>
            <th className="wq-atable-th" style={{ width: 28 }} />
            <th className="wq-atable-th">Prime</th>
            <th className="wq-atable-th wq-atable-r">Contracts</th>
            <th className="wq-atable-th wq-atable-r">Total value</th>
            <th className="wq-atable-th">Nearest recompete</th>
            <th className="wq-atable-th">Best Fit</th>
            <th className="wq-atable-th">Disposition</th>
            <th className="wq-atable-th">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const isOpen = open.has(g.key);
            const hot = g.nearestDays != null && g.nearestDays <= 90;
            const warm = g.nearestDays != null && g.nearestDays <= recompeteDays;
            return (
              <React.Fragment key={g.key}>
                <tr className="wq-atable-row" onClick={() => toggle(g.key)}>
                  <td className="wq-atable-td" aria-label={isOpen ? "Collapse" : "Expand"}>
                    {isOpen ? "▾" : "▸"}
                  </td>
                  <td className="wq-atable-td">
                    {g.uei ? (
                      <a
                        href={`/prime/${g.uei}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="wq-atable-prime blurable"
                        style={{ color: "inherit", textDecoration: "none", borderBottom: "1px dotted #9ca3af" }}
                        title="Open account"
                      >
                        {g.name}
                      </a>
                    ) : (
                      <div className="wq-atable-prime blurable">{g.name}</div>
                    )}
                    {g.uei && (
                      <div className="wq-atable-sub blurable">
                        <span>{g.uei}</span>
                      </div>
                    )}
                  </td>
                  <td className="wq-atable-td wq-atable-r">{g.awards.length}</td>
                  <td className="wq-atable-td wq-atable-r wq-atable-amt">{fmtMoney(g.total || null)}</td>
                  <td className="wq-atable-td">
                    {g.allEnded ? (
                      <span className="wq-atable-state wq-state-ended">All ended</span>
                    ) : g.nearestDays == null ? (
                      "—"
                    ) : warm ? (
                      <span className={`wq-chip ${hot ? "wq-clock-hot" : "wq-clock-warm"}`}>
                        {fmtDate(g.nearestEnd)} · {Math.round(g.nearestDays / 30.44)}mo
                      </span>
                    ) : (
                      <span className="wq-atable-state wq-state-active">Outside window · {fmtDate(g.nearestEnd)}</span>
                    )}
                  </td>
                  <td className="wq-atable-td">
                    <span
                      className={`wq-chip ${scoreBand(g.bestScore)}`}
                      title={g.bestBand ? GAP_LABEL[g.bestBand] || g.bestBand : ""}
                    >
                      {g.bestScore ?? "—"}
                    </span>
                    {g.bestBand && (
                      <div className="wq-atable-sub">{GAP_LABEL[g.bestBand] || g.bestBand}</div>
                    )}
                  </td>
                  <td className="wq-atable-td">
                    {DISP_ORDER.filter((d) => g.disp[d]).map((d) => (
                      <span key={d} className={`wq-chip ${DISPOSITION_CLASS[d]}`} style={{ marginRight: 4 }}>
                        {g.disp[d]} {d}
                      </span>
                    ))}
                    {DISP_ORDER.every((d) => !g.disp[d]) && "—"}
                  </td>
                  <td className="wq-atable-td wq-atable-motion">
                    {g.vendor ? (
                      <span
                        className="blurable"
                        style={{ fontWeight: 600 }}
                        title="Public evidence about this prime in general, not a specific contract"
                      >
                        {g.vendor}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={8} style={{ padding: "4px 0 16px 28px", background: "rgba(0,0,0,0.02)" }}>
                      <AwardTable
                        awards={g.awards}
                        onRowClick={onRowClick}
                        recompeteDays={recompeteDays}
                        awardDays={awardDays}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
