// src/components/pursued/PursuedTab.jsx
//
// Unified Pursued Pipeline: one table per TENANT across all of its OIPs —
// SAM, Derived Demand and SLED — laid out like the Market Review award table.
//
// Replaces the stage-grouped cards (PursuedCard) that lived in App.jsx. That
// version scoped siblings by tenant + vertical, so SLED pursuits (a different
// vertical) never appeared beside SAM / Derived Demand ones.
//
// Data:
//   pursued_signals            snapshot (frozen at pursue time), stage, owner
//   pursued_signal_activities  activity log -> "Last activity"
//   signals (live)             SAM / SLED due date, agency, division — the
//                              snapshot never stored a due date
//   get_tenant_member_emails   owner names (migration 013)
//
// The brief drawer stays in App.jsx (SignalDrawer is not exported), so this
// component calls onViewBrief(item, sourceLabel) and App renders the drawer.
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useOip } from "../../lib/oip";
import { useAuth } from "../../lib/auth";

export const PURSUED_STAGES = ["CO Contact", "Prospect Contact", "Meeting set", "Meeting held", "Hand to Customer"];

const MONO = "'IBM Plex Mono', monospace";
const th = { padding: "10px 12px", fontSize: 11, fontFamily: MONO, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink-fade)", textAlign: "left", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" };
const td = { padding: "14px 12px", fontSize: 14, verticalAlign: "top" };
const pill = (bg, fg) => ({ display: "inline-block", padding: "3px 10px", borderRadius: 6, fontFamily: MONO, fontSize: 12, fontWeight: 600, background: bg, color: fg, whiteSpace: "nowrap" });
const SOURCE_STYLE = {
  "SAM": pill("#f3f4f6", "#374151"),
  "Derived Demand": pill("#eef2ff", "#4338ca"),
  "SLED": pill("#ecfdf5", "#047857"),
};
const TIER_FIT = { tier1_strong: 90, tier1: 75, tier2: 55 };
const TIER_LABEL = { tier1_strong: "Strong", tier1: "Tier 1", tier2: "Tier 2" };

function sourceFor(oip) {
  if (oip?.slug?.endsWith("-derived")) return "Derived Demand";
  if (oip?.verticals?.slug === "sam") return "SAM";
  return "SLED";
}

function parseDay(iso) {
  if (!iso) return null;
  const s = String(iso);
  // Accept YYYY-MM-DD..., or M/D/YYYY (City Record / NYSCR style)
  let d = /^\d{4}-\d{2}-\d{2}/.test(s) ? new Date(`${s.slice(0, 10)}T00:00:00Z`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
function daysFromToday(d) {
  if (!d) return null;
  const n = new Date();
  const today = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((day - today) / 86400000);
}
const fmtDay = (d) => d ? `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(2)}` : "";
const fmtMoney = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
};

// Same look as the Market Review recompete chip: red <= 30 days, amber <= 180.
function KeyDateChip({ date, kind }) {
  if (!date) return <span style={{ color: "var(--ink-fade)" }}>—</span>;
  const days = daysFromToday(date);
  let rel, style;
  if (days < 0) {
    rel = kind === "recompete" ? "ended" : "closed";
    style = pill("#f3f4f6", "#6b7280");
  } else {
    rel = days < 31 ? `${days}d` : `${Math.round(days / 30.4)}mo`;
    style = days <= 30 ? pill("#fde8e8", "#b91c1c") : days <= 180 ? pill("#fef3c7", "#92400e") : pill("#f3f4f6", "#374151");
  }
  return (
    <span style={style} title={kind === "recompete" ? "Recompete (period of performance ends)" : "Response due"}>
      {fmtDay(date)} · {rel}
    </span>
  );
}

// Normalize one pursued row to the table's columns, per source.
function shape(it, source, live) {
  const s = it.snapshot || {};
  const m = live?.metadata || {};
  if (source === "Derived Demand") {
    const keyDate = parseDay(s.pop_end_date);
    return {
      opportunity: s.incumbent_name || s.title || "Untitled",
      subline: s.title && s.incumbent_name ? s.title : "",
      ids: [s.naics_code ? `NAICS ${s.naics_code}` : "", s.incumbent_uei || ""].filter(Boolean).join("  "),
      agency: s.sub_agency || s.agency || "",
      agencySub: s.sub_agency && s.agency && s.sub_agency !== s.agency ? s.agency : "",
      amount: s.current_value ?? null,
      keyDate, keyKind: "recompete",
      fitNum: s.b2b_score ?? null, fitLabel: s.b2b_score != null ? String(s.b2b_score) : "—",
      docUrl: "",
    };
  }
  const due = m.response_deadline || m.due_date || m.ad_end_date || null;
  const agency = m.agency_name || m.department_name || live?.source_name || s.source_name || "";
  const division = m.agency_division || m.sub_tier || "";
  const ident = m.pin || m.cr_number || m.solicitation_number || m.notice_id || "";
  const tier = s.signal_tier || "";
  return {
    opportunity: live?.title || s.title || "Untitled",
    subline: "",
    ids: [ident ? `#${ident}` : "", s.state || ""].filter(Boolean).join("  "),
    agency, agencySub: division,
    amount: m.estimated_value ?? m.award_amount ?? null,
    keyDate: parseDay(due), keyKind: "due",
    fitNum: TIER_FIT[tier] ?? null, fitLabel: TIER_LABEL[tier] || "—",
    docUrl: live?.doc_url || s.doc_url || "",
  };
}

export default function PursuedTab({ onViewBrief, briefLoadingId, titleExtra = null }) {
  const { selectedOip } = useOip();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [members, setMembers] = useState([]); // [{user_id, email}]
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [sourceF, setSourceF] = useState("all");
  const [stageF, setStageF] = useState("all");
  const [ownerF, setOwnerF] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "keyDate", dir: "asc" });
  const [expanded, setExpanded] = useState(null);
  const [logFor, setLogFor] = useState(null);

  const tenantId = selectedOip?.tenant_id;

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // Every OIP of this tenant, across verticals (SAM, Derived Demand, SLED).
        const { data: oips, error: oe } = await supabase
          .from("oips").select("id, slug, verticals(slug)").eq("tenant_id", tenantId);
        if (oe) throw oe;
        const srcByOip = {};
        for (const o of oips || []) srcByOip[o.id] = sourceFor(o);
        const oipIds = Object.keys(srcByOip);
        if (!oipIds.length) { if (!cancelled) { setRows([]); setLoading(false); } return; }

        const { data: ps, error: pe } = await supabase
          .from("pursued_signals")
          .select("id, oip_id, signal_id, snapshot, pipeline_stage, notes, pursued_at, pursued_by, owner, last_updated_at")
          .in("oip_id", oipIds)
          .order("pursued_at", { ascending: false });
        if (pe) throw pe;
        const list = ps || [];

        // Live signal records for SAM / SLED (due date, agency, division).
        const liveIds = list.filter((p) => srcByOip[p.oip_id] !== "Derived Demand").map((p) => p.signal_id);
        const liveById = {};
        if (liveIds.length) {
          const { data: sigs } = await supabase
            .from("signals").select("id, title, source_name, doc_url, metadata").in("id", liveIds);
          for (const sg of sigs || []) liveById[sg.id] = sg;
        }

        const actsById = {};
        if (list.length) {
          const { data: acts } = await supabase
            .from("pursued_signal_activities")
            .select("id, pursued_signal_id, worked_by, action_taken, outcome, next_step, next_action_date, created_at")
            .in("pursued_signal_id", list.map((p) => p.id))
            .order("created_at", { ascending: false });
          for (const a of acts || []) (actsById[a.pursued_signal_id] ||= []).push(a);
        }

        const { data: mem } = await supabase.rpc("get_tenant_member_emails", { p_tenant_id: tenantId });

        if (cancelled) return;
        setMembers(mem || []);
        setRows(list.map((p) => {
          const source = srcByOip[p.oip_id] || "SLED";
          return { ...p, source, activities: actsById[p.id] || [], ...shape(p, source, liveById[p.signal_id]) };
        }));
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  // Owner choices: only this tenant's own logins, matched by the tenant key in
  // the email (OIP slug prefix: "seenthis-sled" -> "seenthis" matches
  // adam+seenthis@winquest.ai and kathy.sanborn@seenthis.com, not
  // adam@winquest.ai). Full emails are shown so plus-addressed logins of the
  // same person stay distinguishable.
  const tenantKey = String(selectedOip?.slug || "").split("-")[0].toLowerCase();
  const ownerChoices = tenantKey
    ? members.filter((m) => String(m.email || "").toLowerCase().includes(tenantKey))
    : members;
  const emailOf = (uid) => members.find((m) => m.user_id === uid)?.email || "";
  const shortName = (uid) => {
    if (!uid) return "Unassigned";
    return emailOf(uid) || "Member";
  };

  const updateRow = (id, patch) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const updateStage = async (id, stage) => {
    const { error } = await supabase.from("pursued_signals")
      .update({ pipeline_stage: stage, last_updated_at: new Date().toISOString(), last_updated_by: user?.id || null })
      .eq("id", id);
    if (error) alert("Stage update failed: " + error.message);
    else updateRow(id, { pipeline_stage: stage });
  };

  const updateOwner = async (id, owner) => {
    const value = owner || null;
    const { error } = await supabase.from("pursued_signals")
      .update({ owner: value, last_updated_at: new Date().toISOString(), last_updated_by: user?.id || null })
      .eq("id", id);
    if (error) alert("Owner update failed: " + error.message);
    else updateRow(id, { owner: value });
  };

  const addActivity = async (pursuedId, entry) => {
    const { data, error } = await supabase
      .from("pursued_signal_activities")
      .insert({
        pursued_signal_id: pursuedId,
        worked_by: entry.workedBy || null,
        action_taken: entry.actionTaken || null,
        outcome: entry.outcome || null,
        next_step: entry.nextStep || null,
        next_action_date: entry.nextActionDate || null,
      })
      .select("id, pursued_signal_id, worked_by, action_taken, outcome, next_step, next_action_date, created_at")
      .single();
    if (error) { alert("Save failed: " + error.message); return false; }
    const now = new Date().toISOString();
    await supabase.from("pursued_signals").update({ last_updated_at: now, last_updated_by: user?.id || null }).eq("id", pursuedId);
    setRows((prev) => prev.map((r) => (r.id === pursuedId ? { ...r, activities: [data, ...r.activities], last_updated_at: now } : r)));
    return true;
  };

  const visible = useMemo(() => {
    let list = rows.slice();
    if (sourceF !== "all") list = list.filter((r) => r.source === sourceF);
    if (stageF !== "all") list = list.filter((r) => (r.pipeline_stage || PURSUED_STAGES[0]) === stageF);
    if (ownerF === "me") list = list.filter((r) => r.owner === user?.id);
    else if (ownerF === "none") list = list.filter((r) => !r.owner);
    else if (ownerF !== "all") list = list.filter((r) => r.owner === ownerF);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) => [r.opportunity, r.subline, r.agency, r.agencySub, r.ids].join(" ").toLowerCase().includes(q));

    const lastAct = (r) => r.activities[0]?.created_at || r.pursued_at;
    const val = {
      opportunity: (r) => r.opportunity.toLowerCase(),
      source: (r) => r.source,
      agency: (r) => (r.agency || "").toLowerCase(),
      amount: (r) => Number(r.amount) || 0,
      // upcoming first (soonest), then past dates, then no date
      keyDate: (r) => {
        const d = daysFromToday(r.keyDate);
        return d == null ? 1e9 : d < 0 ? 1e6 - d : d;
      },
      fit: (r) => r.fitNum ?? -1,
      stage: (r) => PURSUED_STAGES.indexOf(r.pipeline_stage || PURSUED_STAGES[0]),
      owner: (r) => shortName(r.owner).toLowerCase(),
      lastActivity: (r) => new Date(lastAct(r)).getTime(),
    }[sort.key];
    list.sort((a, b) => {
      const x = val(a), y = val(b);
      const c = x < y ? -1 : x > y ? 1 : 0;
      return sort.dir === "asc" ? c : -c;
    });
    return list;
  }, [rows, sourceF, stageF, ownerF, search, sort, user?.id, members]);

  const sortBy = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : (["fit", "amount", "lastActivity"].includes(key) ? "desc" : "asc") }));
  const Th = ({ k, children, style }) => (
    <th style={{ ...th, ...style }} onClick={() => sortBy(k)}>
      {children}{sort.key === k ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );

  const sourcesPresent = [...new Set(rows.map((r) => r.source))];
  const selectStyle = { fontFamily: "inherit", fontSize: 15, padding: "10px 14px", border: "1px solid var(--rule-strong)", borderRadius: 4, background: "var(--paper)" };

  if (loading) return <div style={{ padding: 24, fontFamily: MONO, color: "var(--ink-fade)" }}>Loading…</div>;

  return (
    <div className="detail-section">
      <div className="detail-eyebrow">Pursued Pipeline · {rows.length} active</div>
      <h2 className="detail-title">Your pursued opportunities{titleExtra}</h2>

      {error && <div style={{ color: "#b91c1c", margin: "12px 0" }}>Couldn&rsquo;t load pursued items: {String(error.message || error)}</div>}

      {rows.length === 0 && !error ? (
        <p style={{ color: "var(--ink-fade)" }}>No pursued items yet. Move an opportunity into the pipeline from Market Review or Derived Demand to track it here.</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", margin: "16px 0" }}>
            <select value={sourceF} onChange={(e) => setSourceF(e.target.value)} style={selectStyle}>
              <option value="all">All sources</option>
              {["SAM", "Derived Demand", "SLED"].filter((s) => sourcesPresent.includes(s)).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={stageF} onChange={(e) => setStageF(e.target.value)} style={selectStyle}>
              <option value="all">All stages</option>
              {PURSUED_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={ownerF} onChange={(e) => setOwnerF(e.target.value)} style={selectStyle}>
              <option value="all">All owners</option>
              <option value="me">Mine</option>
              <option value="none">Unassigned</option>
              {ownerChoices.map((m) => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
            </select>
            <input type="search" placeholder="Search opportunity, agency, or ID…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...selectStyle, minWidth: 320, fontFamily: MONO, fontSize: 14 }} />
          </div>

          <div style={{ fontWeight: 600, margin: "8px 0 12px" }}>
            {visible.length}{visible.length !== rows.length ? ` of ${rows.length}` : ""} pursued
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--rule)" }}>
                  <Th k="opportunity">Opportunity</Th>
                  <Th k="source">Source</Th>
                  <Th k="agency">Agency</Th>
                  <Th k="amount" style={{ textAlign: "right" }}>Amount</Th>
                  <Th k="keyDate">Key date</Th>
                  <Th k="fit">Fit</Th>
                  <Th k="stage">Stage</Th>
                  <Th k="owner">Owner</Th>
                  <Th k="lastActivity">Last activity</Th>
                  <th style={{ ...th, cursor: "default" }} />
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const last = r.activities[0];
                  const open = expanded === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr style={{ borderBottom: open ? "none" : "1px solid var(--rule)" }}>
                        <td style={{ ...td, minWidth: 260 }} className="blurable">
                          <div style={{ fontWeight: 600, textDecoration: "underline dotted", textUnderlineOffset: 4, cursor: "pointer" }}
                            onClick={() => onViewBrief && onViewBrief(r, r.source)}>
                            {r.opportunity}
                          </div>
                          {r.subline && <div style={{ fontSize: 13, color: "var(--ink-light)", marginTop: 4 }}>{r.subline}</div>}
                          {r.ids && <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--ink-fade)", marginTop: 4 }}>{r.ids}</div>}
                        </td>
                        <td style={td}><span style={SOURCE_STYLE[r.source]}>{r.source}</span></td>
                        <td style={{ ...td, minWidth: 180 }}>
                          <div>{r.agency || "—"}</div>
                          {r.agencySub && <div style={{ fontSize: 13, color: "var(--ink-light)", marginTop: 4 }}>{r.agencySub}</div>}
                        </td>
                        <td style={{ ...td, textAlign: "right", fontFamily: MONO, fontWeight: 600 }}>{fmtMoney(r.amount)}</td>
                        <td style={td}><KeyDateChip date={r.keyDate} kind={r.keyKind} /></td>
                        <td style={td}><span style={pill("#f3f4f6", "#374151")}>{r.fitLabel}</span></td>
                        <td style={td}>
                          <select value={r.pipeline_stage || PURSUED_STAGES[0]} onChange={(e) => updateStage(r.id, e.target.value)}
                            style={{ fontFamily: MONO, fontSize: 12, padding: "4px 6px", border: "1px solid var(--primary)", borderRadius: 4, background: "var(--primary-soft)", color: "var(--primary-dark)" }}>
                            {PURSUED_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td style={td}>
                          <select value={r.owner || ""} onChange={(e) => updateOwner(r.id, e.target.value)}
                            title={r.pursued_by ? `Pursued by ${emailOf(r.pursued_by) || "a team member"}` : ""}
                            style={{ fontFamily: MONO, fontSize: 12, padding: "4px 6px", border: "1px solid var(--rule-strong)", borderRadius: 4, background: "var(--paper)", maxWidth: 240 }}>
                            <option value="">Unassigned</option>
                            {r.owner && !ownerChoices.some((m) => m.user_id === r.owner) && (
                              <option value={r.owner}>{emailOf(r.owner) || "Former member"}</option>
                            )}
                            {ownerChoices.map((m) => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
                          </select>
                        </td>
                        <td style={{ ...td, minWidth: 170, fontSize: 13 }}>
                          {last ? (
                            <>
                              <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--ink-fade)" }}>{new Date(last.created_at).toLocaleDateString()}</div>
                              <div>{last.action_taken || last.outcome || last.next_step}</div>
                              {last.next_action_date && <div style={{ fontSize: 12, color: "var(--ink-light)" }}>Next: {new Date(last.next_action_date + "T00:00:00").toLocaleDateString()}</div>}
                            </>
                          ) : (
                            <span style={{ color: "var(--ink-fade)" }}>Pursued {new Date(r.pursued_at).toLocaleDateString()}</span>
                          )}
                          {r.activities.length > 0 && (
                            <button type="button" onClick={() => setExpanded(open ? null : r.id)}
                              style={{ display: "block", marginTop: 4, padding: 0, border: "none", background: "none", color: "var(--primary)", cursor: "pointer", fontSize: 12 }}>
                              {open ? "Hide" : `History (${r.activities.length})`}
                            </button>
                          )}
                        </td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          <button type="button" onClick={() => setLogFor(r)}
                            style={{ padding: "5px 10px", fontSize: 12, borderRadius: 4, border: "1px solid var(--primary)", background: "var(--paper)", color: "var(--primary)", cursor: "pointer", marginRight: 6 }}>
                            + Log
                          </button>
                          <button type="button" onClick={() => onViewBrief && onViewBrief(r, r.source)} disabled={briefLoadingId === r.id}
                            style={{ padding: "5px 10px", fontSize: 12, borderRadius: 4, border: "1px solid var(--rule-strong)", background: "var(--paper)", color: "var(--ink)", cursor: "pointer" }}>
                            {briefLoadingId === r.id ? "Loading…" : "Brief"}
                          </button>
                          {r.docUrl && (
                            <a href={r.docUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 6, fontSize: 12 }}>Source ↗</a>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr style={{ borderBottom: "1px solid var(--rule)" }}>
                          <td colSpan={10} style={{ padding: "0 12px 14px 24px" }}>
                            {r.activities.map((a) => (
                              <div key={a.id} style={{ borderTop: "1px solid var(--rule)", padding: "8px 0", fontSize: 13 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-fade)", marginBottom: 4, fontFamily: MONO }}>
                                  <span>{a.worked_by || "Unattributed"}</span>
                                  <span>{new Date(a.created_at).toLocaleString()}</span>
                                </div>
                                {a.action_taken && <div><strong>Did:</strong> {a.action_taken}</div>}
                                {a.outcome && <div><strong>Result:</strong> {a.outcome}</div>}
                                {a.next_step && <div><strong>Next:</strong> {a.next_step}{a.next_action_date ? ` — due ${new Date(a.next_action_date + "T00:00:00").toLocaleDateString()}` : ""}</div>}
                              </div>
                            ))}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {logFor && (
        <LogActivityModal
          item={logFor}
          defaultWorkedBy={user?.email || ""}
          onClose={() => setLogFor(null)}
          onSave={async (entry) => { const ok = await addActivity(logFor.id, entry); if (ok) setLogFor(null); return ok; }}
        />
      )}
    </div>
  );
}

function LogActivityModal({ item, defaultWorkedBy, onClose, onSave }) {
  const [workedBy, setWorkedBy] = useState(defaultWorkedBy);
  const [actionTaken, setActionTaken] = useState("");
  const [outcome, setOutcome] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");
  const [saving, setSaving] = useState(false);
  const field = { fontFamily: "inherit", fontSize: 13, padding: "6px 8px", border: "1px solid var(--rule)", borderRadius: 4, boxSizing: "border-box", width: "100%" };

  const save = async () => {
    if (!actionTaken.trim() && !outcome.trim() && !nextStep.trim()) return;
    setSaving(true);
    await onSave({ workedBy, actionTaken, outcome, nextStep, nextActionDate: nextActionDate || null });
    setSaving(false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 92vw)", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 6, padding: 20, boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}>
        <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--ink-fade)", marginBottom: 4 }}>Log activity</div>
        <div style={{ fontWeight: 600, marginBottom: 12 }} className="blurable">{item.opportunity}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <input type="text" value={workedBy} onChange={(e) => setWorkedBy(e.target.value)} placeholder="Worked by" style={field} />
          <input type="date" value={nextActionDate} onChange={(e) => setNextActionDate(e.target.value)} title="Next action date (optional)" style={field} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <input type="text" value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} placeholder="What did you do" style={field} />
          <input type="text" value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Result" style={field} />
        </div>
        <input type="text" value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="Next step" style={{ ...field, marginBottom: 14 }} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={{ padding: "5px 12px", fontSize: 12, borderRadius: 4, border: "1px solid var(--rule)", background: "var(--paper)", color: "var(--ink-fade)", cursor: "pointer" }}>Cancel</button>
          <button type="button" onClick={save} disabled={saving} style={{ padding: "5px 12px", fontSize: 12, borderRadius: 4, border: "1px solid var(--primary)", background: "var(--primary)", color: "#fff", cursor: "pointer" }}>
            {saving ? "Saving…" : "Add entry"}
          </button>
        </div>
      </div>
    </div>
  );
}
