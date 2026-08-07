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
  const dd2Gated = bd.scores?.gated === true || a.disposition === "No";
  const chipsHtml = [
    `<span class="badge score">${dd2Gated ? "—" : (a.score ?? "—")}<span class="badge-sub"> ${dd2Gated ? "not scored" : "B2B fit"}</span></span>`,
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

  // ── Recompete (DD v2) schema detection ────────────────────────────────────
  // MIRRORS the rewritten recompete branch of B2BBusDevReport.jsx. The handler
  // no longer writes lm_analysis / lm_confidence / scope_text / prime_capability
  // — gap is the entailment GATE (binary, not scored) and what replaced it as a
  // score is SIZE (deliverable 35% + contract value 65%), composited S40 U30 T30.
  const isDD2Recompete = bd.entailment != null && bd.incumbent_name != null;

  const entail = bd.entailment || {};
  const scores = bd.scores || {};
  const book = bd.prime_book || {};
  const perfNew = bd.performance || {};
  const dd2Contact = bd.contacts?.contact || null;
  const inefficiency = entail.capability_called_for || entail.delivery_inefficiency || entail.missing_capability || null;
  const play = bd.entry_play || null;
  const siteRead = bd.site_read || null;
  const siteProfile = siteRead && siteRead._profile ? siteRead._profile : null;

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

  const confidenceBadge = (conf) => {
    if (!conf) return "";
    const bgColor = { high: "#d4edda", medium: "#fff3cd", low: "#f8d7da" }[conf] || "#e2e3e5";
    const textColor = { high: "#155724", medium: "#856404", low: "#721c24" }[conf] || "#383d41";
    return `<div style="margin-top:8px;font-size:11px;color:#666;">Confidence: <span style="display:inline-block;padding:2px 6px;background:${bgColor};color:${textColor};border-radius:3px;font-weight:600;font-size:10px;">${esc(conf.toUpperCase())}</span></div>`;
  };

  // Gated: lead with why and stop. A contract that does not need what the
  // tenant sells is not a weak opportunity — it is not an opportunity.
  const dd2GatedHtml = dd2Gated
    ? section(
        "Not an opportunity",
        para(bd.why_no || entail.reason || "Entailment failed.") +
          mutedP(bd.work_summary ? `What this contract buys: ${bd.work_summary}` : null)
      )
    : "";

  const dd2ScopeHtml = !dd2Gated && bd.work_summary
    ? section(
        "What this contract buys",
        para(bd.work_summary) +
          (Array.isArray(bd.required_capabilities) && bd.required_capabilities.length
            ? `<p class="muted">Capabilities the work requires:</p>${list(bd.required_capabilities)}`
            : "") +
          confidenceBadge(bd.scope_confidence)
      )
    : "";

  const dd2DeliveryHtml = !dd2Gated && (inefficiency || entail.incumbent_method)
    ? section(
        "How the incumbent delivers this today",
        para(entail.incumbent_method) +
          mutedP(deliveryModeLabel) +
          (inefficiency ? `<p class="muted">The opening:</p>${para(inefficiency)}` : "") +
          (entail.chain ? `<p class="muted">Entailment:</p>${para(entail.chain)}` : "") +
          confidenceBadge(entail.confidence)
      )
    : "";

  const dd2WhyNowHtml = !dd2Gated ? section("Why now", para(bd.why_now)) : "";

  const dd2PlayHtml = !dd2Gated && play
    ? section(
        "Suggested sales play",
        para(play.opening) +
          (play.anchor ? `<p class="muted">What makes it credible:</p>${para(play.anchor)}` : "") +
          (play.timing_rationale ? `<p class="muted">Why this moment:</p>${para(play.timing_rationale)}` : "") +
          (Array.isArray(play.their_language) && play.their_language.length
            ? `<p class="muted">Their words, worth using:</p>${para(play.their_language.join(" \u00B7 "))}`
            : "") +
          (play.find_out_first ? `<p class="muted">Find out first:</p>${para(play.find_out_first)}` : "") +
          (play.avoid
            ? `<div class="avoid"><span class="avoid-lbl">Do not assert</span>${esc(play.avoid)}</div>`
            : "") +
          (play.strength ? mutedP(`Opening strength: ${play.strength}`) : "")
      )
    : "";

  const dd2SiteHtml = siteProfile
    ? section(
        "How they describe themselves",
        para(siteProfile.self_description) +
          grid([
            ["Presents as", String(siteProfile.posture || "\u2014").replace(/_/g, " ")],
            [
              "Technology named",
              Array.isArray(siteProfile.named_technology) && siteProfile.named_technology.length
                ? siteProfile.named_technology.join(", ")
                : "none named on their site",
            ],
            ...(Array.isArray(siteProfile.service_lines) && siteProfile.service_lines.length
              ? [["Service lines", siteProfile.service_lines.join(", ")]]
              : []),
          ]) +
          (siteRead && siteRead.overlap
            ? `<p class="muted">Overlap with what you do:</p>${para(siteRead.overlap)}`
            : "") +
          (siteRead && siteRead.complementarity
            ? `<p class="muted">Where you would sit alongside:</p>${para(siteRead.complementarity)}`
            : "") +
          (siteRead && siteRead.conversation_note
            ? `<p class="muted">Before the call:</p>${para(siteRead.conversation_note)}`
            : "") +
          mutedP(
            "Read from their public website. Marketing copy, not a finding about how they operate." +
              (siteRead && siteRead.read_quality ? ` Read quality: ${siteRead.read_quality}.` : "")
          )
      )
    : "";

  const dd2AwardHtml = section(
    "Current award",
    grid([
      ["Award value", fmtMoney(bd.current_value)],
      [
        "Period ends",
        bd.pop_end_date
          ? `${new Date(bd.pop_end_date).toLocaleDateString()}${daysOut != null && daysOut >= 0 ? ` · ${daysOut} days out` : ""}`
          : "—",
      ],
      ["Agency", bd.sub_agency || bd.agency || "—"],
      ["NAICS", bd.naics_code ? `${bd.naics_code} — ${bd.naics_description || ""}` : "—"],
      ["Set-aside", bd.set_aside || "None"],
    ])
  );

  const dd2ScoreHtml = !dd2Gated
    ? section(
        "Scoring breakdown",
        grid([
          ["Size (40%)", scores.size != null ? `${Math.round(scores.size)}/100` : "—"],
          [
            "· deliverable (35% of size)",
            scores.deliverable != null
              ? `${scores.deliverable}/100${scores.deliverable_band ? ` — ${scores.deliverable_band}` : ""}`
              : "—",
          ],
          [
            "· contract value (65% of size)",
            scores.value != null ? `${scores.value}/100${scores.value_note ? ` — ${scores.value_note}` : ""}` : "—",
          ],
          ["Urgency (30%)", scores.urgency != null ? `${Math.round(scores.urgency)}/100` : "—"],
          ["Timing (30%)", scores.timing != null ? `${Math.round(scores.timing)}/100` : "—"],
          ["B2B score", scores.b2b_score != null ? `${scores.b2b_score}/100` : "—"],
        ]) + mutedP(bandLabel)
      )
    : "";

  const dd2RawScopeHtml = section("Award scope (as filed)", para(bd.award_scope));

  const dd2AccountHtml =
    book.awards != null || book.total != null
      ? section(
          "The account",
          grid([
            [
              "Federal book",
              `${book.total ? fmtMoney(book.total) : "—"}${book.awards ? ` · ${book.awards} awards` : ""}`,
            ],
            ...(book.growth_pct != null
              ? [["Book trajectory", `${book.growth_pct > 0 ? "+" : ""}${book.growth_pct}% recent vs prior`]]
              : []),
          ])
        )
      : "";

  // Denominators stated, never blended: performance covers only the awards
  // whose transaction ledgers were fetched, not the whole book.
  const dd2PerfHtml =
    !dd2Gated && perfNew.ledger_count > 0
      ? section(
          "Performance read",
          grid([
            [
              "Deobligations",
              `${perfNew.deoblig_total ? fmtMoney(perfNew.deoblig_total) : "none"}${
                perfNew.deoblig_rate != null ? ` · ${Math.round(perfNew.deoblig_rate * 100)}% of scored awards` : ""
              }`,
            ],
            ["Terminations", String(perfNew.terminations ?? 0)],
          ]) +
            mutedP(
              `Based on ${perfNew.ledger_count} of ${perfNew.book_count} awards — highest-value transaction ledgers only.`
            )
        )
      : "";

  const dd2ContactHtml =
    !dd2Gated && dd2Contact
      ? section(
          "Point of contact",
          `<p><strong>${esc(dd2Contact.name)}</strong>${dd2Contact.title ? ` — ${esc(dd2Contact.title)}` : ""}</p>` +
            mutedP([dd2Contact.city, dd2Contact.state].filter(Boolean).join(", ")) +
            mutedP("Source: SAM entity registration")
        )
      : "";

  const dd2SurfacedHtml = section(
    "How this surfaced",
    `<p class="muted">Surfaced from federal recompete intelligence (PIID ${esc(bd.piid || a.piid || "—")}).${
      dd2Gated
        ? " Rejected at the entailment gate — the work does not require what you supply."
        : " Passed the entailment gate, then scored on size, urgency and recompete timing."
    }</p>`
  );

  const dd2Html = [
    dd2GatedHtml,
    dd2ScopeHtml,
    dd2DeliveryHtml,
    dd2WhyNowHtml,
    dd2PlayHtml,
    dd2AwardHtml,
    dd2ScoreHtml,
    dd2RawScopeHtml,
    dd2AccountHtml,
    dd2SiteHtml,
    dd2PerfHtml,
    dd2ContactHtml,
    dd2SurfacedHtml,
  ].join("");

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
  .avoid { margin-top: 10px; padding: 8px 12px; background: #fdf6f6;
           border-left: 3px solid #b91c1c; font-size: 12px; color: #4b5563; }
  .avoid-lbl { display: block; font-family: Arial, sans-serif; font-size: 10px;
               text-transform: uppercase; letter-spacing: .06em; color: #b91c1c;
               font-weight: 700; margin-bottom: 3px; }
  @media print { body { margin: 0; } }
</style></head><body>
  <h1>${esc(a.recipient || "Prime (unresolved)")}</h1>
  <div class="sub">${subjectBits.join(" · ") || "—"}</div>

  <div class="badges">${chipsHtml}</div>

  ${isDD2Recompete ? dd2Html : [
    coreHtml, healthBannerHtml, whyNowHtml, entailmentHtml,
    salesPlanHtml, pocHtml, perfHtml, crossSellHtml, confidenceHtml,
  ].join("")}
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
