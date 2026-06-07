// src/components/awards/B2BBusDevReport.jsx
//
// Renders the b2b_busdev jsonb in the detail drawer (the Awards-mode analog of
// your notice WinQuest Analysis three-section layout). Defensive: the LLM output
// can vary, so every section degrades gracefully when a field is missing.
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

export default function B2BBusDevReport({ award }) {
  const bd = award.busdev || {};
  const ent = bd.entailment || {};
  const pos = bd.positioning || {};
  const perf = bd.performance || {};
  const tgt = perf.target_contract || {};
  const port = perf.prime_portfolio || {};
  const who = Array.isArray(pos.who_to_call) ? pos.who_to_call : [];
  const crossSell = Array.isArray(pos.cross_sell) ? pos.cross_sell : [];

  return (
    <div className="wq-awards wq-report">
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

      <Section title="How this surfaced">
        <p className="wq-rep-muted">
          Surfaced from federal award data (<span className="blurable">{award.agency || "—"}
          {award.naics ? ` · NAICS ${award.naics}` : ""}</span>), then scored on delivery
          entailment — not a keyword match.
        </p>
        {ent.chain ? <p className="wq-rep-p blurable">{ent.chain}</p> : null}
      </Section>

      <Section title="Why now">
        {award.whyNow ? <p className="wq-rep-p blurable">{award.whyNow}</p> : null}
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
          <span>Chain</span>
          <span className="blurable">{ent.chain || "—"}</span>
          <span>Incumbent method</span>
          <span>{award.incumbentMethod || pos.incumbent_method || "—"}</span>
        </div>
      </Section>

      <Section title="Pitch">{pos.pitch ? <p className="wq-rep-p blurable">{pos.pitch}</p> : null}</Section>
      <Section title="Pain">{pos.pain ? <p className="wq-rep-p blurable">{pos.pain}</p> : null}</Section>

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
              {port.chronic_risk ? (
                <span className="wq-flag"> · chronic-risk flag</span>
              ) : null}
            </p>
            <Bullets items={port.bullets} />
          </>
        ) : (
          <p className="wq-rep-muted">Prime portfolio: {port?.note || "not scored"}</p>
        )}
      </Section>

      {who.length > 0 && (
        <Section title="Who to call">
          <ul className="wq-rep-people">
            {who.map((p, i) => (
              <li key={i}>
                <strong className="blurable">{p.name || "TBD"}</strong>
                {p.role ? ` — ${p.role}` : ""}
                {p.linkedin ? (
                  <>
                    {" · "}
                    <a
                      className="wq-li-link blurable"
                      href={p.linkedin}
                      target="_blank"
                      rel="noreferrer"
                    >
                      LinkedIn ↗
                    </a>
                  </>
                ) : null}
                {p.location ? <span className="wq-rep-loc"> · {p.location}</span> : null}
                {p.why ? <div className="wq-rep-muted blurable">{p.why}</div> : null}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {crossSell.length > 0 && (
        <Section title="Cross-sell">
          <Bullets items={crossSell} />
        </Section>
      )}

      <Section title="Confidence">
        {pos.confidence ? <p className="wq-rep-muted">{pos.confidence}</p> : null}
      </Section>

      <div className="wq-rep-actions">
        <button type="button" className="wq-btn" onClick={() => downloadAwardBrief(award)}>
          Download B2B Brief
        </button>
        {bd.vendor?.website && (
          <a className="wq-btn wq-btn-ghost" href={bd.vendor.website} target="_blank" rel="noreferrer">
            <span className="blurable">{award.recipient || "Prime"}</span> site
          </a>
        )}
      </div>
    </div>
  );
}
