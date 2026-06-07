// src/lib/awardsBrief.js
//
// Builds a printable B2B Bus Dev brief and opens it in a new window for
// browser print-to-PDF — same mechanism as your notice "Download Brief".

const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const fmtMoney = (n) =>
  n == null ? "—" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const list = (items) =>
  Array.isArray(items) && items.length
    ? `<ul>${items.map((i) => `<li>${esc(typeof i === "string" ? i : JSON.stringify(i))}</li>`).join("")}</ul>`
    : "";

export function buildAwardBriefHtml(a) {
  const bd = a.busdev || {};
  const pos = bd.positioning || {};
  const ent = bd.entailment || {};
  const perf = bd.performance || {};
  const tgt = perf.target_contract || {};
  const port = perf.prime_portfolio || {};

  const who = Array.isArray(pos.who_to_call)
    ? pos.who_to_call
        .map(
          (p) =>
            `<li><strong>${esc(p.name || "TBD")}</strong>${p.role ? ` — ${esc(p.role)}` : ""}${
              p.why ? `<br/><span class="muted">${esc(p.why)}</span>` : ""
            }</li>`
        )
        .join("")
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>B2B Bus Dev Brief — ${esc(a.recipient || a.piid)}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; max-width: 760px;
         margin: 40px auto; line-height: 1.5; padding: 0 24px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .06em; color: #555;
       border-bottom: 1px solid #ddd; padding-bottom: 4px; margin: 24px 0 8px; }
  .sub { color: #666; font-size: 13px; margin-bottom: 16px; }
  .badges { margin: 12px 0 4px; }
  .badge { display: inline-block; font-family: Arial, sans-serif; font-size: 11px; font-weight: 700;
           padding: 3px 9px; border-radius: 4px; margin-right: 6px; letter-spacing: .03em; }
  .score { background: #0f3d2e; color: #fff; }
  .disp  { background: #1d4ed8; color: #fff; }
  .chip  { background: #eee; color: #333; }
  .muted { color: #666; }
  ul { margin: 6px 0; padding-left: 20px; }
  .grid { display: grid; grid-template-columns: 140px 1fr; gap: 4px 12px; font-size: 13px; }
  .grid div:nth-child(odd) { color: #777; }
  @media print { body { margin: 0; } }
</style></head><body>
  <h1>${esc(a.recipient || "Unknown prime")}</h1>
  <div class="sub">${esc(a.piid)} · ${esc(a.agency)}${a.subAgency ? ` / ${esc(a.subAgency)}` : ""} · ${fmtMoney(a.amount)}</div>

  <div class="badges">
    <span class="badge score">B2B ${a.score ?? "—"}/100</span>
    <span class="badge disp">${esc(a.disposition || "—")}</span>
    ${a.motion ? `<span class="badge chip">${esc(a.motion)}</span>` : ""}
    ${a.difficulty ? `<span class="badge chip">displace: ${esc(a.difficulty)}</span>` : ""}
  </div>

  ${a.whyNow ? `<h2>Why now</h2><p>${esc(a.whyNow)}</p>` : ""}

  <h2>Entailment</h2>
  <div class="grid">
    <div>Read</div><div>${esc(ent.entailment || "—")} · mode: ${esc(ent.mode || "—")}</div>
    <div>Capability</div><div>${esc(ent.capability || "—")}</div>
    <div>Chain</div><div>${esc(ent.chain || "—")}</div>
    <div>Incumbent method</div><div>${esc(a.incumbentMethod || pos.incumbent_method || "—")}</div>
  </div>

  ${pos.pitch ? `<h2>Pitch</h2><p>${esc(pos.pitch)}</p>` : ""}
  ${pos.pain ? `<h2>Pain</h2><p>${esc(pos.pain)}</p>` : ""}

  <h2>Performance read</h2>
  ${tgt.narrative ? `<p><strong>Target contract:</strong> ${esc(tgt.narrative)}</p>` : ""}
  ${list(tgt.bullets)}
  ${
    port && port.scored
      ? `<p><strong>Prime portfolio</strong> (health ${port.portfolio_health ?? "—"}/100${
          port.chronic_risk ? ", <span style='color:#b91c1c'>chronic-risk flag</span>" : ""
        }):</p>${list(port.bullets)}`
      : `<p class="muted">Prime portfolio: ${esc((port && port.note) || "not scored")}</p>`
  }

  ${who ? `<h2>Who to call</h2><ul>${who}</ul>` : ""}
  ${list(pos.cross_sell) ? `<h2>Cross-sell</h2>${list(pos.cross_sell)}` : ""}
  ${pos.confidence ? `<h2>Confidence</h2><p class="muted">${esc(pos.confidence)}</p>` : ""}
</body></html>`;
}

export function downloadAwardBrief(a) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(buildAwardBriefHtml(a));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
}
