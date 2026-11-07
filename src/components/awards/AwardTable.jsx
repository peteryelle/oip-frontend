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

// Gap-fit labels (dd_v2_brief_handler stage 2). Present on rows whose tenant
// has gap fit on; then b2b_score IS the gap-fit score.
const GAP_LABEL = {
  evidenced: "Evidenced gap",
  plausible: "Plausible gap",
  unknown: "Gap unknown",
  no_gap: "No gap",
};

// Fit definition — opened by clicking the ⓘ on the Fit column. A large modal
// (not a hover tooltip): readable, and stays open until the user closes it.
function FitDefinitionModal({ onClose }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = [
    ["Evidenced gap", "75–95", "The prime already buys what you sell, from a competitor or another vendor. The need and budget are proven."],
    ["Plausible gap", "50–70", "The prime works in this field but shows no sign of doing this themselves, so they likely buy it from someone."],
    ["Gap unknown", "40–55", "There is not enough public information to tell."],
    ["No gap", "not briefed", "The prime does this work themselves, so no sales brief is written."],
  ];
  const cell = { padding: "10px 12px", borderBottom: "1px solid #e5e7eb", verticalAlign: "top", textAlign: "left" };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.45)", zIndex: 1000,
               display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="What Fit means"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(66vw, 980px)", maxWidth: "94vw", maxHeight: "80vh", overflowY: "auto",
                 background: "#fff", borderRadius: 10, padding: "28px 32px",
                 boxShadow: "0 20px 50px rgba(0,0,0,0.25)", fontSize: 16, lineHeight: 1.55,
                 color: "#1f2937", textTransform: "none", letterSpacing: "normal", fontWeight: 400,
                 fontFamily: "inherit", cursor: "default" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 24 }}>What Fit means</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ border: "1px solid #d1d5db", background: "#fff", borderRadius: 6,
                     padding: "6px 14px", fontSize: 15, cursor: "pointer" }}
          >
            Close ✕
          </button>
        </div>

        <p style={{ marginTop: 14 }}>
          <strong>Fit (0–100)</strong> ranks how worth pursuing each opportunity is. It answers one
          question first: <em>does this prime need what you sell from someone outside?</em> That
          answer — the gap rating — sets the score range.
        </p>

        <h3 style={{ fontSize: 18, margin: "22px 0 8px" }}>The four gap ratings</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
          <thead>
            <tr>
              <th style={{ ...cell, fontWeight: 600 }}>Rating</th>
              <th style={{ ...cell, fontWeight: 600, whiteSpace: "nowrap" }}>Fit range</th>
              <th style={{ ...cell, fontWeight: 600 }}>What it means</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, range, text]) => (
              <tr key={label}>
                <td style={{ ...cell, fontWeight: 600, whiteSpace: "nowrap" }}>{label}</td>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>{range}</td>
                <td style={cell}>{text}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={{ fontSize: 18, margin: "22px 0 8px" }}>What places the score within the range</h3>
        <ul style={{ margin: 0, paddingLeft: 22 }}>
          <li><strong>Size — 40%.</strong> How large the contract is and how central your kind of work is to it.</li>
          <li><strong>Urgency — 30%.</strong> Signs the account is in motion, such as funding changes or contract actions.</li>
          <li><strong>Timing — 30%.</strong> How close the contract is to renewal or recompete — the window to get in.</li>
        </ul>
        <p style={{ marginTop: 12 }}>
          How directly your own track record covers this work adjusts the result. A large, urgent
          contract cannot outrank a prime with a proven need.
        </p>
        <p style={{ marginTop: 12, color: "#6b7280", fontSize: 14 }}>
          The gap rating uses public evidence about each prime in general, not a specific contract,
          and is re-checked monthly. No evidence does not mean they don't buy it.
        </p>
      </div>
    </div>
  );
}

function vendorLine(gf) {
  if (!gf) return null;
  if (gf.tech_evidence === "competitor_in_use" || gf.tech_evidence === "other_vendor_in_use")
    return gf.vendor_named ? `Works with ${gf.vendor_named}` : null;
  if (gf.tech_evidence === "relationship_only")
    return gf.vendor_named ? `Relationship with ${gf.vendor_named}` : null;
  return null;
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
function fmtShortDate(iso) {
  if (!iso) return "";
  return new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

// Recompete cell for a contract whose PoP has ended. Uses the follow-on
// written by the worker's busdev_dd_v2_follow_on job (b2b_busdev.follow_on):
// lost -> "Lost to <new prime> · <signed>", retained -> "Retained · <signed>".
// No follow-on yet -> the plain "Ended" state.
function EndedState({ followOn, popDate }) {
  const fo = followOn || {};
  const tip = [fo.note, fo.base_and_all_options ? `Up to ${fmtMoney(fo.base_and_all_options)} with options` : null]
    .filter(Boolean).join(" · ");
  const linkProps = fo.url
    ? { href: fo.url, target: "_blank", rel: "noopener noreferrer", onClick: (e) => e.stopPropagation() }
    : null;
  if (fo.outcome === "lost" && fo.new_prime) {
    const body = (
      <>
        Lost to <strong>{fo.new_prime}</strong>
        {fo.signed ? ` · ${fmtShortDate(fo.signed)}` : ""}
      </>
    );
    return linkProps ? (
      <a className="wq-atable-state wq-state-lost" title={tip} {...linkProps}>{body}</a>
    ) : (
      <span className="wq-atable-state wq-state-lost" title={tip}>{body}</span>
    );
  }
  if (fo.outcome === "retained") {
    const body = <>Retained{fo.signed ? ` · ${fmtShortDate(fo.signed)}` : ""}</>;
    return linkProps ? (
      <a className="wq-atable-state wq-state-retained" title={tip} {...linkProps}>{body}</a>
    ) : (
      <span className="wq-atable-state wq-state-retained" title={tip}>{body}</span>
    );
  }
  return (
    <span className="wq-atable-state wq-state-ended" title={fo.note || ""}>
      Ended · {popDate}
    </span>
  );
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
  const [showFitDef, setShowFitDef] = useState(false);

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

  const SortTh = ({ label, k, right, info }) => (
    <th
      className={`wq-atable-th${right ? " wq-atable-r" : ""}${sortKey === k ? " is-sorted" : ""}`}
      onClick={() => toggleSort(k)}
    >
      {label}
      {info && (
        <button
          type="button"
          aria-label="What Fit means"
          onClick={(e) => { e.stopPropagation(); info(); }}
          style={{ marginLeft: 6, border: "1px solid currentColor", borderRadius: "50%",
                   width: 20, height: 20, lineHeight: "18px", padding: 0, fontSize: 12,
                   background: "transparent", color: "inherit", cursor: "pointer",
                   verticalAlign: "middle", fontWeight: 600 }}
        >
          ?
        </button>
      )}{" "}
      {sortKey === k ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <div className="wq-atable-wrap">
      {showFitDef && <FitDefinitionModal onClose={() => setShowFitDef(false)} />}
      <table className="wq-atable">
        <thead>
          <tr>
            <SortTh label="Prime" k="prime" />
            <th className="wq-atable-th">Agency</th>
            <SortTh label="Amount" k="amount" right />
            <SortTh label="Prime Total" k="primeTotal" right />
            <SortTh label="Recompete" k="recompete" />
            <SortTh label="Fit" k="score" info={() => setShowFitDef(true)} />
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
                  {a.busdev?.follow_on?.outcome === "lost" && (
                    <span className="wq-chip wq-flag-lost" title={a.busdev.follow_on.note || ""}>
                      New prime
                    </span>
                  )}
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
                    <EndedState followOn={a.busdev?.follow_on} popDate={pop.date} />
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
                    <span
                      className="wq-chip wq-score-na"
                      title={a.busdev?.scores?.gap_gated ? "No gap — the prime does this work itself" : "Rejected at the entailment gate"}
                    >
                      —
                    </span>
                  ) : a.busdev?.gap_fit?.band ? (
                    // Gap-fit rows: the stored score is the gap-fit score. The
                    // size/urgency/timing hover badge would recompute the old
                    // composite, so show the score with the rating instead.
                    <span
                      className={`wq-chip ${scoreBand(a.score)}`}
                      title={`${GAP_LABEL[a.busdev.gap_fit.band] || a.busdev.gap_fit.band} · Fit ${a.score ?? "—"}`}
                    >
                      {a.score ?? "—"}
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
                  {vendorLine(a.busdev?.gap_fit) ? (
                    <span
                      className="blurable"
                      style={{ fontWeight: 600 }}
                      title="Public evidence about this prime in general, not this contract specifically"
                    >
                      {vendorLine(a.busdev.gap_fit)}
                    </span>
                  ) : (
                    DELIVERY_LABEL[a.difficulty] ||
                    (a.motion ? MOTION_LABEL[a.motion] || a.motion : "—")
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
