// src/components/awards/B2BBusDevReport.jsx
//
// Renders the b2b_busdev jsonb in the detail drawer. Defensive: the LLM output
// can vary, so every section degrades gracefully when a field is missing.
// Brief order: SUBJECT (who is analyzed) -> How this surfaced -> Why now ->
// Entailment -> Solution -> Point of contact -> Performance read -> Cross-sell.
import React from "react";
import { downloadAwardBrief } from "../../lib/awardsBrief";
import { SignalSubawardsPanel } from "../SignalSubawardsPanel";

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
  
  // Detect schema: recompete (govcon_dd_v2) vs old award (USASpending)
  const isRecompete = bd.incumbent_name != null;
  
  // OLD SCHEMA (USASpending awards)
  const ent = bd.entailment || {};
  const pos = bd.positioning || {};
  const perf = bd.performance || {};
  const tgt = perf.target_contract || {};
  const port = perf.prime_portfolio || {};
  const crossSell = Array.isArray(pos.cross_sell) ? pos.cross_sell : [];
  const subs = Array.isArray(bd.subs) ? bd.subs : [];
  
  // NEW SCHEMA (Recompete / govcon_dd_v2)
  const scores = bd.scores || {};
  const primeCap = bd.prime_capability || {};
  const recomSubs = Array.isArray(bd.subcontractors) ? bd.subcontractors : [];

  // Recompete state drives whether the incumbent-health banner shows at top.
  const isRecompeteWindow =
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

  // RECOMPETE (govcon_dd_v2) — rewritten for the gate/size/urgency/timing brief.
  //
  // The handler's output shape changed: gap is no longer a scored term (it is
  // the entailment GATE, which is binary), and what replaced it as a score is
  // SIZE — deliverable centrality 35% + contract value 65%. Composite is
  // S40 * U30 * T30. Every lm_analysis.* / lm_confidence.* / scope_text /
  // prime_capability key this branch used to read is gone.
  if (isRecompete) {
    const entail = bd.entailment || {};
    const gated = scores.gated === true || award.disposition === "No";
    const book = bd.prime_book || {};
    const perfNew = bd.performance || {};
    const contact = bd.contacts?.contact || null;
    const inefficiency = entail.delivery_inefficiency || entail.missing_capability || null;

    const deliveryModeLabel = {
      own_platform: "Runs their own platform for this",
      outsourced: "Buys this capability from third parties",
      manual: "Delivers with people and process",
      unknown: "Delivery method not evidenced",
    }[entail.delivery_mode] || null;

    const bandLabel = {
      central: "Central — the contract is principally this work",
      meaningful: "Meaningful — one substantial component among several",
      peripheral: "Peripheral — a minor element",
    }[scores.deliverable_band] || null;

    const daysOut = bd.pop_end_date
      ? Math.round((new Date(bd.pop_end_date) - new Date()) / 86400000)
      : null;

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
            <span className="wq-rep-score-num">{gated ? "—" : (scores.b2b_score ?? "—")}</span>
            <span className="wq-rep-score-lbl">{gated ? "not scored" : "B2B fit"}</span>
          </div>
          <div className="wq-rep-tags">
            {award.disposition && (
              <span className={`wq-chip ${gated ? "wq-disp-none" : "wq-disp-strong"}`}>
                {award.disposition}
              </span>
            )}
            {!gated && bandLabel && (
              <span className="wq-chip">{scores.deliverable_band}</span>
            )}
          </div>
        </div>

        {/* SUBJECT: Incumbent */}
        <div className="wq-rep-subject">
          <div className="wq-rep-subject-name blurable">{bd.incumbent_name || "Incumbent (unresolved)"}</div>
          <div className="wq-rep-subject-meta">
            {bd.piid ? <span className="blurable">{bd.piid}</span> : null}
            {bd.agency ? <span className="blurable">{bd.agency}</span> : null}
            {bd.naics_code ? <span className="blurable">NAICS {bd.naics_code}</span> : null}
          </div>
        </div>

        {/* GATED — the entailment gate rejected this. Lead with why and stop.
            No score, no breakdown: a contract that does not need what you sell
            is not a weak opportunity, it is not an opportunity. */}
        {gated && (
          <Section title="Not an opportunity">
            <p className="wq-rep-p blurable">{bd.why_no || entail.reason || "Entailment failed."}</p>
            {bd.work_summary && (
              <p className="wq-rep-muted" style={{ marginTop: "0.5rem" }}>
                What this contract buys: {bd.work_summary}
              </p>
            )}
          </Section>
        )}

        {/* WHAT THE WORK IS — read blind, before any vendor context */}
        {!gated && bd.work_summary && (
          <Section title="What this contract buys">
            <p className="wq-rep-p blurable">{bd.work_summary}</p>
            {Array.isArray(bd.required_capabilities) && bd.required_capabilities.length > 0 && (
              <>
                <p className="wq-rep-muted" style={{ marginTop: "0.5rem" }}>Capabilities the work requires:</p>
                <Bullets items={bd.required_capabilities} />
              </>
            )}
            {bd.scope_confidence && (
              <div className="wq-rep-confidence">
                Scope confidence: <span className={`badge-${bd.scope_confidence}`}>{bd.scope_confidence.toUpperCase()}</span>
              </div>
            )}
          </Section>
        )}

        {/* THE OPENING — delivery inefficiency, not a capability gap */}
        {!gated && (inefficiency || entail.incumbent_method) && (
          <Section title="How the incumbent delivers this today">
            {entail.incumbent_method && <p className="wq-rep-p blurable">{entail.incumbent_method}</p>}
            {deliveryModeLabel && (
              <p className="wq-rep-muted" style={{ marginTop: "0.35rem" }}>{deliveryModeLabel}</p>
            )}
            {inefficiency && (
              <>
                <p className="wq-rep-muted" style={{ marginTop: "0.75rem" }}>The opening:</p>
                <p className="wq-rep-p blurable">{inefficiency}</p>
              </>
            )}
            {entail.chain && (
              <>
                <p className="wq-rep-muted" style={{ marginTop: "0.75rem" }}>Entailment:</p>
                <p className="wq-rep-p blurable">{entail.chain}</p>
              </>
            )}
            {entail.confidence && (
              <div className="wq-rep-confidence">
                Confidence: <span className={`badge-${entail.confidence}`}>{entail.confidence.toUpperCase()}</span>
              </div>
            )}
          </Section>
        )}

        {/* WHY NOW */}
        {!gated && bd.why_now && (
          <Section title="Why now">
            <p className="wq-rep-p blurable">{bd.why_now}</p>
          </Section>
        )}

        {/* CURRENT AWARD */}
        <Section title="Current award">
          <div className="wq-rep-grid">
            <span>Award value</span>
            <span>{bd.current_value ? `$${Math.round(bd.current_value).toLocaleString()}` : "—"}</span>
            <span>Period ends</span>
            <span>
              {bd.pop_end_date ? new Date(bd.pop_end_date).toLocaleDateString() : "—"}
              {daysOut != null && daysOut >= 0 ? ` · ${daysOut} days out` : ""}
            </span>
            <span>Agency</span>
            <span className="blurable">{bd.sub_agency || bd.agency || "—"}</span>
            <span>NAICS</span>
            <span>{bd.naics_code ? `${bd.naics_code} — ${bd.naics_description || ""}` : "—"}</span>
            <span>Set-aside</span>
            <span>{bd.set_aside || "None"}</span>
          </div>
        </Section>

        {/* SCORING — S40 U30 T30, with SIZE decomposed */}
        {!gated && (
          <Section title="Scoring breakdown">
            <div className="wq-rep-grid">
              <span>Size (40%)</span>
              <span>{scores.size != null ? `${Math.round(scores.size)}/100` : "—"}</span>
              <span style={{ paddingLeft: "1rem" }}>· deliverable (35% of size)</span>
              <span>{scores.deliverable != null ? `${scores.deliverable}/100` : "—"}{bandLabel ? ` — ${scores.deliverable_band}` : ""}</span>
              <span style={{ paddingLeft: "1rem" }}>· contract value (65% of size)</span>
              <span>{scores.value != null ? `${scores.value}/100` : "—"}{scores.value_note ? ` — ${scores.value_note}` : ""}</span>
              <span>Urgency (30%)</span>
              <span>{scores.urgency != null ? `${Math.round(scores.urgency)}/100` : "—"}</span>
              <span>Timing (30%)</span>
              <span>{scores.timing != null ? `${Math.round(scores.timing)}/100` : "—"}</span>
              <span><strong>B2B score</strong></span>
              <span><strong>{scores.b2b_score != null ? `${scores.b2b_score}/100` : "—"}</strong></span>
            </div>
            {bandLabel && <p className="wq-rep-muted" style={{ marginTop: "0.5rem" }}>{bandLabel}</p>}
          </Section>
        )}

        {/* AWARD SCOPE — the raw USASpending text, not a model summary */}
        {bd.award_scope && (
          <Section title="Award scope (as filed)">
            <p className="wq-rep-p blurable">{bd.award_scope}</p>
          </Section>
        )}

        {/* THE ACCOUNT — thin strip; depth lives on the account route */}
        {!gated && (book.awards != null || book.total != null) && (
          <Section title="The account">
            <div className="wq-rep-grid">
              <span>Federal book</span>
              <span>
                {book.total ? `$${Math.round(book.total).toLocaleString()}` : "—"}
                {book.awards ? ` · ${book.awards} awards` : ""}
              </span>
              {book.growth_pct != null && (
                <>
                  <span>Book trajectory</span>
                  <span>{book.growth_pct > 0 ? "+" : ""}{book.growth_pct}% recent vs prior</span>
                </>
              )}
            </div>
          </Section>
        )}

        {/* PERFORMANCE — denominators always stated */}
        {!gated && perfNew.ledger_count > 0 && (
          <Section title="Performance read">
            <div className="wq-rep-grid">
              <span>Deobligations</span>
              <span>
                {perfNew.deoblig_total ? `$${Math.round(perfNew.deoblig_total).toLocaleString()}` : "none"}
                {perfNew.deoblig_rate != null ? ` · ${Math.round(perfNew.deoblig_rate * 100)}% of scored awards` : ""}
              </span>
              <span>Terminations</span>
              <span>{perfNew.terminations ?? 0}</span>
              {perfNew.mean_delta_pct != null && (
                <>
                  <span>Mean scope change</span>
                  <span>{perfNew.mean_delta_pct}%</span>
                </>
              )}
            </div>
            <p className="wq-rep-muted" style={{ marginTop: "0.5rem" }}>
              Based on {perfNew.ledger_count} of {perfNew.book_count} awards — highest-value transaction ledgers only.
            </p>
          </Section>
        )}

        {/* CONTACT */}
        {!gated && contact && (
          <Section title="Point of contact">
            <p className="wq-rep-p blurable">
              <strong>{contact.name}</strong>{contact.title ? ` — ${contact.title}` : ""}
            </p>
            {(contact.city || contact.state) && (
              <p className="wq-rep-muted">{[contact.city, contact.state].filter(Boolean).join(", ")}</p>
            )}
            <p className="wq-rep-muted" style={{ marginTop: "0.35rem" }}>
              Source: SAM entity registration
            </p>
          </Section>
        )}

        <Section title="How this surfaced">
          <p className="wq-rep-muted">
            Surfaced from federal recompete intelligence (PIID <span className="blurable">{bd.piid}</span>).
            {gated
              ? " Rejected at the entailment gate — the work does not require what you supply."
              : " Passed the entailment gate, then scored on size, urgency and recompete timing."}
          </p>
        </Section>

        <div className="wq-rep-actions">
          <button
            type="button"
            className="wq-btn"
            onClick={() => downloadAwardBrief(award, { subscriberName, recompeteDays })}
          >
            Download Brief
          </button>
        </div>
      </div>
    );
  }

  // OLD SCHEMA: render traditional award brief
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

      {/* B2B SUBAWARDS ENRICHMENT — all subs under prime + POCs + agency CO */}
      {award.b2b_subawards && <SignalSubawardsPanel b2b_subawards={award.b2b_subawards} />}

      {/* SUBCONTRACTORS — named FFATA teaming on the incumbent's award = displacement
          targets / the seam to slot into. Empty or absent renders as "not disclosed",
          deliberately distinct from "none": absence is a reporting gap, not evidence the
          prime self-performs. Inferred/likely subs (new-award lane) are a later add. */}
      <Section title="Subcontractors">
        {subs.length > 0 ? (
          <>
            <p className="wq-rep-muted">
              Named on the incumbent's current award (FFATA) — the teaming you'd displace or slot into.
            </p>
            <ul className="wq-rep-bullets">
              {subs.map((s, i) => {
                const naics = Array.isArray(s.won_naics) ? s.won_naics : [];
                const primary = s.dominant || naics[0] || null;
                const more = naics.length > 1 ? ` (+${naics.length - 1})` : "";
                const amt =
                  typeof s.subaward_amount === "number"
                    ? ` — $${Math.round(s.subaward_amount).toLocaleString()}`
                    : "";
                return (
                  <li key={s.uei || i}>
                    <span className="blurable">{s.name || "Unnamed sub"}</span>
                    {amt}
                    {primary ? ` · NAICS ${primary}${more}` : ""}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="wq-rep-muted">
            Not disclosed — no FFATA subcontract data on this award (absent or not yet filed).
            That's a reporting gap, not evidence the prime self-performs; current teaming simply
            isn't public here.
          </p>
        )}
      </Section>

      {isRecompeteWindow && (
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

const badgeStyles = `
  .wq-rep-confidence {
    margin-top: 0.5rem;
    font-size: 0.85rem;
    color: #666;
  }
  
  .badge-high {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background: #d4edda;
    color: #155724;
    border-radius: 3px;
    font-weight: 600;
    font-size: 0.75rem;
  }
  
  .badge-medium {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background: #fff3cd;
    color: #856404;
    border-radius: 3px;
    font-weight: 600;
    font-size: 0.75rem;
  }
  
  .badge-low {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background: #f8d7da;
    color: #721c24;
    border-radius: 3px;
    font-weight: 600;
    font-size: 0.75rem;
  }
  
  .badge-unavailable {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background: #e2e3e5;
    color: #383d41;
    border-radius: 3px;
    font-weight: 600;
    font-size: 0.75rem;
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.innerHTML = badgeStyles;
  document.head.appendChild(style);
}
