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

  // ── How this surfaced ──
  const surfacedHtml = section(
    "How this surfaced",
    `<p class="muted">Surfaced from federal award data (${esc(a.agency || "—")}${
      a.naics ? ` · NAICS ${esc(a.naics)}` : ""
    }), then scored on delivery entailment — not a keyword match.</p>`
  );

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

  ${coreHtml}
  ${healthBannerHtml}
  ${surfacedHtml}
  ${whyNowHtml}
  ${entailmentHtml}
  ${salesPlanHtml}
  ${pocHtml}
  ${perfHtml}
  ${crossSellHtml}
  ${confidenceHtml}
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
