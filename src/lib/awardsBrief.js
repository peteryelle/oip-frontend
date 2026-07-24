// src/lib/awardsBrief.js
//
// Builds a printable B2B Bus Dev brief and opens it in a new window for
// browser print-to-PDF. This MIRRORS components/awards/B2BBusDevReport.jsx
// section-for-section and field-for-field so the PDF stays a 1:1 copy of the
// on-screen brief. If you change the report component, change this to match
// (or move both onto a shared renderer).

const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const fmtMoney = (n) =>
  n == null ? "—" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const list = (items) =>
  Array.isArray(items) && items.length
    ? `<ul>${items.map((i) => `<li>${esc(typeof i === "string" ? i : JSON.stringify(i))}</li>`).join("")}</ul>`
    : "";

// Section helper — drops the header entirely when there's no inner content,
// matching the report's <Section> (returns null when childless).
const section = (title, inner) => (inner ? `<h2>${esc(title)}</h2>${inner}` : "");
const para = (text) => (text ? `<p>${esc(text)}</p>` : "");
const mutedP = (text) => (text ? `<p class="muted">${esc(text)}</p>` : "");
const grid = (rows) =>
  `<div class="grid">${rows.map(([k, v]) => `<div>${esc(k)}</div><div>${esc(v)}</div>`).join("")}</div>`;

const healthBand = (h) => (h == null ? "" : h < 50 ? "weak" : h < 70 ? "mixed" : "strong");

export function buildAwardBriefHtml(a, opts = {}) {
  const { subscriberName = null, recompeteDays = 180 } = opts;

  const bd = a.busdev || {};
  const pos = bd.positioning || {};
  const ent = bd.entailment || {};
  const perf = bd.performance || {};
  const tgt = perf.target_contract || {};
  const port = perf.prime_portfolio || {};
  const crossSell = Array.isArray(pos.cross_sell) ? pos.cross_sell : [];

  const isRecompete =
    a.daysToPopEnd != null && a.daysToPopEnd >= 0 && a.daysToPopEnd <= recompeteDays;
  const portfolioHealth = port.portfolio_health ?? null;

  // Point of contact — current schema poc:{role,pains,positioning}; fall back to
  // legacy keys for older scored rows (mirror of B2BBusDevReport).
  const whoArr = Array.isArray(pos.who_to_call) ? pos.who_to_call : [];
  const rawPoc =
    pos.poc && typeof pos.poc === "object" ? pos.poc : whoArr[0] ? { role: whoArr[0].role } : null;
  const poc = rawPoc
    ? {
        role: rawPoc.role || null,
        pains: rawPoc.pains || rawPoc.pain_impact || pos.pain || null,
        positioning: rawPoc.positioning || rawPoc.how_we_solve || null,
      }
    : null;

  // Core narrative — elements 1-4: scope -> prime capability -> gap -> fill.
  const awardScope = pos.deliverables || null;
  const primeOffering = pos.prime_core_offering || null;
  const gap = Array.isArray(pos.gaps_addressed)
    ? pos.gaps_addressed
    : Array.isArray(bd.vendor?.gap)
    ? bd.vendor.gap
    : [];
  const fillImpact = pos.impact || null;
  const hasCore = awardScope || primeOffering || gap.length > 0 || fillImpact;

  // ── Subject line — matches report: piid · agency · NAICS (recipient is the H1) ──
  const subjectBits = [
    a.piid ? esc(a.piid) : null,
    a.agency ? esc(a.agency) : null,
    a.naics ? `NAICS ${esc(a.naics)}` : null,
  ].filter(Boolean);

  // ── Header chips ──
  const chipsHtml = [
    `<span class="badge score">${a.score ?? "—"}<span class="badge-sub"> B2B fit</span></span>`,
    a.disposition ? `<span class="badge disp">${esc(a.disposition)}</span>` : "",
    a.motion ? `<span class="badge chip">${esc(a.motion)}</span>` : "",
    a.difficulty ? `<span class="badge chip">displace: ${esc(a.difficulty)}</span>` : "",
    pos.positioning_angle ? `<span class="badge chip">${esc(pos.positioning_angle)}</span>` : "",
  ].join("");

  // ── Core narrative ──
  const coreHtml = hasCore
    ? [
        section("Award scope", para(awardScope)),
        section("Prime's capability to deliver", para(primeOffering)),
        section(
          "The gap — entailed, not evidenced by the prime",
          gap.length > 0
            ? list(gap)
            : `<p class="muted">No separable gap identified — the prime appears to own the entailed scope.</p>`
        ),
        section(
          subscriberName ? `How ${esc(subscriberName)} fills the gap` : "How you fill the gap",
          para(fillImpact)
        ),
      ].join("")
    : "";

  // ── Incumbent-health banner (recompete only) ──
  const healthBannerHtml = isRecompete
    ? `<div class="health ${healthBand(portfolioHealth)}">
         <div class="health-top">
           <span class="health-lbl">Incumbent health</span>
           ${
             portfolioHealth != null
               ? `<span class="health-score">${portfolioHealth}/100</span>`
               : `<span class="muted">not scored</span>`
           }
           ${port.chronic_risk ? `<span class="badge hot">chronic-risk</span>` : ""}
         </div>
         ${Array.isArray(port.bullets) && port.bullets.length ? list(port.bullets) : ""}
         ${
           tgt.narrative
             ? `<p class="muted">This contract: ${esc(tgt.narrative)}${
                 tgt.score != null ? ` (${tgt.score}/100)` : ""
               }</p>`
             : ""
         }
         ${
           portfolioHealth == null
             ? `<p class="muted">Rescore this award to populate the incumbent-health read.</p>`
             : ""
         }
       </div>`
    : "";

  // ── Recompete (DD v2) schema detection — uses lm_analysis instead of positioning ──
  const isDD2Recompete = bd.lm_analysis && typeof bd.lm_analysis === "object";
  
  // ── DD v2 LLM sections (recompete) ──
  const confidenceBadge = (conf) => {
    if (!conf) return "";
    const bgColor = { high: "#d4edda", medium: "#fff3cd", low: "#f8d7da", unavailable: "#e2e3e5" }[conf] || "#e2e3e5";
    const textColor = { high: "#155724", medium: "#856404", low: "#721c24", unavailable: "#383d41" }[conf] || "#383d41";
    return `<div style="margin-top: 8px; font-size: 11px; color: #666;">Confidence: <span style="display: inline-block; padding: 2px 6px; background: ${bgColor}; color: ${textColor}; border-radius: 3px; font-weight: 600; font-size: 10px;">${conf.toUpperCase()}</span></div>`;
  };

  const dd2Html = isDD2Recompete
    ? [
        section("Award scope", para(bd.lm_analysis.award_scope) + confidenceBadge(bd.lm_confidence?.scope)),
        section("The gap — entailed, not evidenced by the prime", para(bd.lm_analysis.advertising_gap) + confidenceBadge(bd.lm_confidence?.gap)),
        section("Why now", para(bd.lm_analysis.why_now) + confidenceBadge(bd.lm_confidence?.urgency)),
        section("Sales positioning", para(bd.lm_analysis.sales_positioning) + confidenceBadge(bd.lm_confidence?.positioning)),
        section("Caveats & missing data", mutedP(bd.lm_caveats)),
      ].join("")
    : "";

  // ── DD v2 Performance (recompete) ──
  const perfPort = bd.performance?.prime_portfolio || {};
  const dd2PerfHtml = isDD2Recompete && perfPort.scored
    ? `<h2>Performance read</h2>
       <p><strong>Prime portfolio</strong> — ${perfPort.scored} contract(s) scored</p>
       ${list(perfPort.bullets || [])}
       ${
         perfPort.portfolio_health != null
           ? `<div style="margin-top: 8px;"><strong>Portfolio health:</strong> ${perfPort.portfolio_health}/100</div>`
           : ""
       }
       ${
         perfPort.option_exercise_rate
           ? `<div><strong>Options exercised:</strong> ${Math.round(perfPort.option_exercise_rate)}%</div>`
           : ""
       }
       ${
         perfPort.deobligation_rate
           ? `<div><strong>Deobligations:</strong> ${Math.round(perfPort.deobligation_rate)}%</div>`
           : ""
       }
       ${
         perfPort.mean_amount_delta_pct
           ? `<div><strong>Mean scope change:</strong> ${perfPort.mean_amount_delta_pct > 0 ? "+" : ""}${Math.round(perfPort.mean_amount_delta_pct)}%</div>`
           : ""
       }`
    : "";

  // ── DD v2 Cross-sell (recompete) ──
  const dd2CrossSellList = (Array.isArray(bd.cross_sell_opportunities) || []).map((cs) =>
    `${esc(cs.agency || "Unknown")}${cs.value ? ` — ${fmtMoney(cs.value)}` : ""}${cs.status ? ` · ${esc(cs.status)}` : ""}`
  );
  const dd2CrossSellHtml = dd2CrossSellList.length ? section("Cross-sell opportunities", list(dd2CrossSellList)) : "";

  // ── Why now ──
  const whyNowHtml = section("Why now", para(a.whyNow || pos.why_now));

  // ── Entailment ──
  const entailmentHtml = section(
    "Entailment",
    grid([
      ["Read", `${ent.entailment || "—"}${ent.mode ? ` · mode: ${ent.mode}` : ""}`],
      ["Capability", ent.capability || "—"],
      ["Why they need this", ent.chain || "—"],
      ["Incumbent method", a.incumbentMethod || bd.vendor?.incumbent_method || "—"],
    ])
  );

  // ── Sales plan ──
  const salesPlanHtml = section("Sales plan", para(pos.sales_plan));

  // ── Point of contact ──
  const pocRows = poc
    ? [
        ...(poc.role ? [["Role", poc.role]] : []),
        ...(poc.pains ? [["Their delivery pains", poc.pains]] : []),
        ...(poc.positioning ? [["How to position", poc.positioning]] : []),
      ]
    : [];
  const pocHtml =
    poc && pocRows.length
      ? section(
          "Point of contact",
          grid(pocRows) +
            `<p class="muted note">Suggested role-based contact. Named real contacts available with an active subscription.</p>`
        )
      : "";

  // ── Performance read ──
  const perfHtml =
    `<h2>Performance read</h2>` +
    (tgt.narrative ? `<p><strong>Target contract:</strong> ${esc(tgt.narrative)}</p>` : "") +
    list(tgt.bullets) +
    (port && port.scored
      ? `<p><strong>Prime portfolio</strong> — health ${port.portfolio_health ?? "—"}/100${
          port.chronic_risk ? ` · <span style="color:#b91c1c">chronic-risk flag</span>` : ""
        }</p>${list(port.bullets)}`
      : `<p class="muted">Prime portfolio: ${esc((port && port.note) || "not scored")}</p>`);

  // ── Cross-sell / Confidence ──
  const crossSellHtml = crossSell.length ? section("Cross-sell", list(crossSell)) : "";
  const confidenceHtml = pos.confidence
    ? section("Confidence", `<p class="muted">${esc(pos.confidence)}</p>`)
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>B2B Bus Dev Brief — ${esc(a.recipient || a.piid)}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; max-width: 760px;
         margin: 40px auto; line-height: 1.5; padding: 0 24px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  h2 { font-size: 13px; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: .06em;
       color: #555; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin: 22px 0 8px; }
  p { margin: 6px 0; }
  .sub { color: #666; font-size: 13px; margin-bottom: 12px; }
  .badges { margin: 10px 0 4px; }
  .badge { display: inline-block; font-family: Arial, sans-serif; font-size: 11px; font-weight: 700;
           padding: 3px 9px; border-radius: 4px; margin-right: 6px; letter-spacing: .03em; }
  .badge-sub { font-weight: 400; opacity: .85; }
  .score { background: #0f3d2e; color: #fff; }
  .disp  { background: #1d4ed8; color: #fff; }
  .chip  { background: #eee; color: #333; }
  .hot   { background: #fee2e2; color: #b91c1c; }
  .muted { color: #666; }
  .note  { font-size: 12px; }
  ul { margin: 6px 0; padding-left: 20px; }
  .grid { display: grid; grid-template-columns: 150px 1fr; gap: 4px 12px; font-size: 13px; }
  .grid div:nth-child(odd) { color: #777; }
  .health { border: 1px solid #e2e2e2; border-left: 4px solid #999; background: #fafafa;
            padding: 10px 14px; margin: 14px 0; border-radius: 0 4px 4px 0; }
  .health.weak { border-left-color: #b91c1c; }
  .health.mixed { border-left-color: #b45309; }
  .health.strong { border-left-color: #0f3d2e; }
  .health-top { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .health-lbl { font-family: Arial, sans-serif; font-size: 11px; text-transform: uppercase;
                letter-spacing: .06em; color: #555; }
  .health-score { font-weight: 700; }
  @media print { body { margin: 0; } }
</style></head><body>
  <h1>${esc(a.recipient || "Prime (unresolved)")}</h1>
  <div class="sub">${subjectBits.join(" · ") || "—"}</div>

  <div class="badges">${chipsHtml}</div>

  ${isDD2Recompete ? dd2Html : coreHtml}
  ${isDD2Recompete ? dd2PerfHtml : healthBannerHtml}
  ${isDD2Recompete ? (section("How this surfaced", `<p class="muted">Surfaced from federal recompete intelligence (PIID ${esc(a.piid || "—")}), scored on gap entailment, urgency (portfolio stress/churn), and recompete timing.</p>`)) : surfacedHtml}
  ${isDD2Recompete ? dd2CrossSellHtml : whyNowHtml}
  ${isDD2Recompete ? "" : entailmentHtml}
  ${isDD2Recompete ? "" : salesPlanHtml}
  ${isDD2Recompete ? "" : pocHtml}
  ${isDD2Recompete ? "" : perfHtml}
  ${isDD2Recompete ? "" : crossSellHtml}
  ${isDD2Recompete ? "" : confidenceHtml}
</body></html>`;
}

export function downloadAwardBrief(a, opts = {}) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(buildAwardBriefHtml(a, opts));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
}
