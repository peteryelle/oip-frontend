// src/components/awards/B2BBusDevReport.jsx
//
// Renders the b2b_busdev jsonb in the detail drawer. Defensive: the LLM output
// can vary, so every section degrades gracefully when a field is missing.
// Brief order: SUBJECT (who is analyzed) -> How this surfaced -> Why now ->
// Entailment -> Solution -> Point of contact -> Performance read -> Cross-sell.
import React from "react";
import { downloadAwardBrief } from "../../lib/awardsBrief";

function Section({ title, children }) {
  if (!children) return null;
  return (
    <div className="wq-rep-section">
      <h4 className="wq-rep-h">{title}</h4>
      {children}
    </div>
  );
}

function Bullets({ items }) {
  if (!Array.isArray(items) || !items.length) return null;
  return (
    <ul className="wq-rep-bullets">
      {items.map((it, i) => (
        <li key={i}>{typeof it === "string" ? it : JSON.stringify(it)}</li>
      ))}
    </ul>
  );
}

function healthBand(h) {
  if (h == null) return "";
  if (h < 50) return "wq-health-weak"; // low health = vulnerable incumbent = displacement opening
  if (h < 70) return "wq-health-mixed";
  return "wq-health-strong";
}

export default function B2BBusDevReport({ award, recompeteDays = 180, subscriberName = null }) {
  const bd = award.busdev || {};
  const ent = bd.entailment || {};
  const pos = bd.positioning || {};
  const perf = bd.performance || {};
  const tgt = perf.target_contract || {};
  const port = perf.prime_portfolio || {};
  const crossSell = Array.isArray(pos.cross_sell) ? pos.cross_sell : [];

  // Recompete state drives whether the incumbent-health banner shows at top.
  const isRecompete =
    award.daysToPopEnd != null && award.daysToPopEnd >= 0 && award.daysToPopEnd <= recompeteDays;
  const portfolioHealth = port.portfolio_health ?? null;

  // Point of contact — current schema poc:{role,pains,positioning}; fall back to
  // legacy keys (pain_impact/how_we_solve/who_to_call) for older scored rows.
  const whoArr = Array.isArray(pos.who_to_call) ? pos.who_to_call : [];
  const rawPoc =
    pos.poc && typeof pos.poc === "object"
      ? pos.poc
      : whoArr[0]
      ? { role: whoArr[0].role }
      : null;
  const poc = rawPoc
    ? {
        role: rawPoc.role || null,
        pains: rawPoc.pains || rawPoc.pain_impact || pos.pain || null,
        positioning: rawPoc.positioning || rawPoc.how_we_solve || null,
      }
    : null;

  // Core narrative — worker brief elements 1-4: award scope -> prime capability
  // -> the gap (entailed, not evidenced by prime) -> how the subscriber fills it.
  const awardScope = pos.deliverables || null; // element 1
  const primeOffering = pos.prime_core_offering || null; // element 2
  const gap = Array.isArray(pos.gaps_addressed) // element 3
    ? pos.gaps_addressed
    : Array.isArray(bd.vendor?.gap)
    ? bd.vendor.gap
    : [];
  const fillImpact = pos.impact || null; // element 4

  // Relevance is the worker's "still surfaced by the latest scan" axis (migration 008).
  // A row the customer moved into their pipeline can go stale without being deleted; flag
  // it here so an opened stale item reads as "kept, not current" rather than fresh.
  const relStatus = award.relevanceStatus || award.relevance_status || "active";
  const isStale = relStatus !== "active";
  const staleLabel =
    {
      stale: "Not in the latest scan",
      outside_window: "Aged past the recency window",
      archived: "Archived",
    }[relStatus] || "Not in the latest scan";
  const staleNote =
    relStatus === "archived"
      ? "Archived — kept on record, not shown in the working list."
      : "No longer surfaced by the latest scan. Kept because it's still in your pipeline.";

  return (
    <div className="wq-awards wq-report">
      {isStale && (
        <div className="wq-rep-stale" role="status">
          <span className="wq-rep-stale-lbl">{staleLabel}</span>
          <span className="wq-rep-stale-note">{staleNote}</span>
        </div>
      )}
      <div className="wq-rep-header">
        <div className="wq-rep-score">
          <span className="wq-rep-score-num">{award.score ?? "—"}</span>
          <span className="wq-rep-score-lbl">B2B fit</span>
        </div>
        <div className="wq-rep-tags">
          {award.disposition && <span className="wq-chip wq-disp-strong">{award.disposition}</span>}
          {award.motion && <span className="wq-chip wq-chip-soft">{award.motion}</span>}
          {award.difficulty && (
            <span className="wq-chip wq-chip-soft">displace: {award.difficulty}</span>
          )}
          {pos.positioning_angle && (
            <span className="wq-chip wq-chip-soft">{pos.positioning_angle}</span>
          )}
        </div>
      </div>

      {/* WHO IS BEING ANALYZED */}
      <div className="wq-rep-subject">
        <div className="wq-rep-subject-name blurable">{award.recipient || "Prime (unresolved)"}</div>
        <div className="wq-rep-subject-meta">
          {award.piid ? <span className="blurable">{award.piid}</span> : null}
          {award.agency ? <span className="blurable">{award.agency}</span> : null}
          {award.naics ? <span>NAICS {award.naics}</span> : null}
        </div>
      </div>

      {/* CORE NARRATIVE — award scope -> prime capability -> gap -> how the subscriber fills it */}
      {(awardScope || primeOffering || gap.length > 0 || fillImpact) && (
        <>
          <Section title="Award scope">
            {awardScope ? <p className="wq-rep-p blurable">{awardScope}</p> : null}
          </Section>
          <Section title="Prime's capability to deliver">
            {primeOffering ? <p className="wq-rep-p blurable">{primeOffering}</p> : null}
          </Section>
          <Section title="The gap — entailed, not evidenced by the prime">
            {gap.length > 0 ? (
              <Bullets items={gap} />
            ) : (
              <p className="wq-rep-muted">
                No separable gap identified — the prime appears to own the entailed scope.
              </p>
            )}
          </Section>
          <Section title={subscriberName ? `How ${subscriberName} fills the gap` : "How you fill the gap"}>
            {fillImpact ? <p className="wq-rep-p blurable">{fillImpact}</p> : null}
          </Section>
        </>
      )}

      {isRecompete && (
        <div className="wq-rep-health">
          <div className="wq-rep-health-top">
            <span className="wq-rep-health-lbl">Incumbent health</span>
            {portfolioHealth != null ? (
              <span className={`wq-rep-health-score ${healthBand(portfolioHealth)}`}>
                {portfolioHealth}/100
              </span>
            ) : (
              <span className="wq-rep-health-na">not scored</span>
            )}
            {port.chronic_risk && <span className="wq-chip wq-clock-hot">chronic-risk</span>}
          </div>
          {Array.isArray(port.bullets) && port.bullets.length > 0 && (
            <Bullets items={port.bullets} />
          )}
          {tgt.narrative && (
            <p className="wq-rep-muted">
              This contract: <span className="blurable">{tgt.narrative}</span>
              {tgt.score != null ? ` (${tgt.score}/100)` : ""}
            </p>
          )}
          {portfolioHealth == null && (
            <p className="wq-rep-muted">Rescore this award to populate the incumbent-health read.</p>
          )}
        </div>
      )}

      <Section title="How this surfaced">
        <p className="wq-rep-muted">
          Surfaced from federal award data (<span className="blurable">{award.agency || "—"}
          {award.naics ? ` · NAICS ${award.naics}` : ""}</span>), then scored on delivery
          entailment — not a keyword match.
        </p>
      </Section>

      <Section title="Why now">
        {(award.whyNow || pos.why_now) ? (
          <p className="wq-rep-p blurable">{award.whyNow || pos.why_now}</p>
        ) : null}
      </Section>

      <Section title="Entailment">
        <div className="wq-rep-grid">
          <span>Read</span>
          <span>
            {ent.entailment || "—"}
            {ent.mode ? ` · mode: ${ent.mode}` : ""}
          </span>
          <span>Capability</span>
          <span className="blurable">{ent.capability || "—"}</span>
          <span>Why they need this</span>
          <span className="blurable">{ent.chain || "—"}</span>
          <span>Incumbent method</span>
          <span>{award.incumbentMethod || bd.vendor?.incumbent_method || "—"}</span>
        </div>
      </Section>

      {/* SALES PLAN — element 5: timing + what to lead with + land->expand->cross-sell */}
      {pos.sales_plan && (
        <Section title="Sales plan">
          <p className="wq-rep-p blurable">{pos.sales_plan}</p>
        </Section>
      )}

      {/* POINT OF CONTACT — role-based; real named contacts on subscription */}
      {poc && (poc.role || poc.pains || poc.positioning) && (
        <Section title="Point of contact">
          <div className="wq-rep-grid">
            {poc.role ? (
              <>
                <span>Role</span>
                <span className="blurable">{poc.role}</span>
              </>
            ) : null}
            {poc.pains ? (
              <>
                <span>Their delivery pains</span>
                <span className="blurable">{poc.pains}</span>
              </>
            ) : null}
            {poc.positioning ? (
              <>
                <span>How to position</span>
                <span className="blurable">{poc.positioning}</span>
              </>
            ) : null}
          </div>
          <p className="wq-rep-muted wq-rep-poc-note">
            Suggested role-based contact. Named real contacts available with an active subscription.
          </p>
        </Section>
      )}

      <Section title="Performance read">
        {tgt.narrative && (
          <p className="wq-rep-p">
            <strong>Target contract:</strong> <span className="blurable">{tgt.narrative}</span>
          </p>
        )}
        <Bullets items={tgt.bullets} />
        {port && port.scored ? (
          <>
            <p className="wq-rep-p">
              <strong>Prime portfolio</strong> — health {port.portfolio_health ?? "—"}/100
              {port.chronic_risk ? <span className="wq-flag"> · chronic-risk flag</span> : null}
            </p>
            <Bullets items={port.bullets} />
          </>
        ) : (
          <p className="wq-rep-muted">Prime portfolio: {port?.note || "not scored"}</p>
        )}
      </Section>

      {crossSell.length > 0 && (
        <Section title="Cross-sell">
          <Bullets items={crossSell} />
        </Section>
      )}

      <Section title="Confidence">
        {pos.confidence ? <p className="wq-rep-muted">{pos.confidence}</p> : null}
      </Section>

      <div className="wq-rep-actions">
        <button
          type="button"
          className="wq-btn"
          onClick={() => downloadAwardBrief(award, { subscriberName, recompeteDays })}
        >
          Download B2B Brief
        </button>
        {award.awardId && (
          <a
            className="wq-btn wq-btn-ghost"
            href={`https://www.usaspending.gov/award/${award.awardId}/`}
            target="_blank"
            rel="noreferrer"
          >
            View on USASpending &#8599;
          </a>
        )}
        {bd.vendor?.website && (
          <a className="wq-btn wq-btn-ghost" href={bd.vendor.website} target="_blank" rel="noreferrer">
            <span className="blurable">{award.recipient || "Prime"}</span> site
          </a>
        )}
      </div>
    </div>
  );
}
