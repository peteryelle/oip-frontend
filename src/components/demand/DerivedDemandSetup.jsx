// src/components/demand/DerivedDemandSetup.jsx
//
// Derived Demand setup page. The scope (agencies x verticals) is DERIVED from
// the subscriber's customer base by the fingerprint — this page is mostly a
// readout of that, plus the one human knob (burden density) and an accept
// control. Takes oipId + verticalId (verticalId is needed to enqueue populate).
import React, { useState } from "react";
import { useDemandSetup } from "../../hooks/useDemandSetup";
import "./demand.css";

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function DerivedDemandSetup({ oipId, verticalId }) {
  const { pullConfig, vlib, overrides, windows, loading, error, saveBurden, saveWindows, promote } =
    useDemandSetup(oipId);
  const [edits, setEdits] = useState({}); // naics -> in-progress string
  const [winEdits, setWinEdits] = useState({}); // recompeteDays|awardDays -> in-progress string
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  if (loading) return <div className="wq-demand"><div className="wq-dem-empty">Loading…</div></div>;
  if (error)
    return (
      <div className="wq-demand">
        <div className="wq-dem-empty">Couldn&rsquo;t load setup: {String(error.message || error)}</div>
      </div>
    );

  const sug = pullConfig.busdev_suggestion || null;
  const liveAgencies = pullConfig.busdev_agencies || [];
  const liveNaics = pullConfig.busdev_naics || [];
  const locked = !!pullConfig.busdev_locked;
  const source = pullConfig.busdev_source || null;
  const derivedAt = fmtDate(pullConfig.busdev_derived_at || sug?.generated_at);

  const vlibMap = Object.fromEntries(vlib.map((v) => [v.naics, v]));
  const effective = (naics) =>
    overrides[naics] != null ? overrides[naics] : vlibMap[naics]?.burden_density ?? null;

  const status = locked
    ? { label: "Locked — review mode", cls: "wq-dds-chip-hold" }
    : source === "derived"
    ? { label: "Derived — live", cls: "wq-dds-chip-yes" }
    : { label: "Hand-authored", cls: "wq-dds-chip-na" };

  const sugAgencyCount = sug?.agencies?.length ?? 0;
  const sugVertCount = sug?.verticals?.length ?? 0;
  const scopeDiffers =
    sugAgencyCount !== liveAgencies.length || sugVertCount !== liveNaics.length;

  const onPromote = async () => {
    if (
      !confirm(
        `Set the live scope to the derived suggestion?\n\n` +
          `Agencies: ${liveAgencies.length} → ${sugAgencyCount}\n` +
          `Verticals: ${liveNaics.length} → ${sugVertCount}\n\n` +
          `This unlocks the OIP and queues a populate sweep.`
      )
    )
      return;
    setBusy(true);
    setNote(null);
    const e = await promote(verticalId);
    setBusy(false);
    setNote(
      e ? `Promote failed: ${e.message || e}` : "Derived scope is live. Populate sweep queued."
    );
  };

  const onBurdenBlur = async (naics) => {
    const raw = edits[naics];
    if (raw == null || raw === "") return;
    const val = Number(raw);
    if (!Number.isFinite(val)) return;
    const e = await saveBurden(naics, val);
    setEdits((prev) => {
      const next = { ...prev };
      delete next[naics];
      return next;
    });
    if (e) setNote(`Burden save failed: ${e.message || e}`);
  };

  const onWindowBlur = async (key) => {
    const raw = winEdits[key];
    if (raw == null || raw === "") return;
    const val = Number(raw);
    if (Number.isFinite(val) && val >= 1) {
      const e = await saveWindows(
        key === "recompeteDays" ? { recompeteDays: val } : { awardDays: val }
      );
      if (e) setNote(`Window save failed: ${e.message || e}`);
    }
    setWinEdits((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  return (
    <div className="wq-demand">
      <div className="wq-dds-head">
        <div>
          <div className="wq-dds-title">Derived demand</div>
          <div className="wq-dds-sub">
            {derivedAt ? `Derived from your customer base · refreshed ${derivedAt}` : "Not yet derived"}
          </div>
        </div>
        <span className={`wq-dds-chip ${status.cls}`}>{status.label}</span>
      </div>

      <div className="wq-dds-sec">
        Timing windows{" "}
        <span className="wq-dds-sec-note">— how the B2B Market Review filters and flags awards</span>
      </div>
      <div className="wq-dds-windows">
        <div className="wq-dds-win">
          <label className="wq-dds-win-lbl" htmlFor="dds-win-award">New-award window</label>
          <div className="wq-dds-win-in">
            <input
              id="dds-win-award"
              type="number"
              min="1"
              step="1"
              value={winEdits.awardDays != null ? winEdits.awardDays : windows.awardDays}
              onChange={(e) => setWinEdits((p) => ({ ...p, awardDays: e.target.value }))}
              onBlur={() => onWindowBlur("awardDays")}
            />
            <span className="wq-dds-win-unit">days</span>
          </div>
          <div className="wq-dds-win-hint">
            Flag an award as new when its performance started within this many days.
          </div>
        </div>
        <div className="wq-dds-win">
          <label className="wq-dds-win-lbl" htmlFor="dds-win-recompete">Recompete horizon</label>
          <div className="wq-dds-win-in">
            <input
              id="dds-win-recompete"
              type="number"
              min="1"
              step="1"
              value={winEdits.recompeteDays != null ? winEdits.recompeteDays : windows.recompeteDays}
              onChange={(e) => setWinEdits((p) => ({ ...p, recompeteDays: e.target.value }))}
              onBlur={() => onWindowBlur("recompeteDays")}
            />
            <span className="wq-dds-win-unit">days</span>
          </div>
          <div className="wq-dds-win-hint">
            Flag an award as recompete-soon when its PoP ends within this many days.
          </div>
        </div>
      </div>

      {!sug && (
        <div className="wq-dem-empty">
          No derived suggestion yet. It generates from the profile&rsquo;s customers when a{" "}
          <code>dd_fingerprint</code> job runs.
        </div>
      )}

      {sug && (
        <>
          <div className="wq-dds-accept">
            <div>
              <div className="wq-dds-accept-h">
                Suggestion ready — {sugAgencyCount} agencies, {sugVertCount} verticals
              </div>
              <div className="wq-dds-accept-s">
                {scopeDiffers
                  ? `Live scope is ${liveAgencies.length} agencies, ${liveNaics.length} verticals. Accepting reshapes the grid.`
                  : "Live scope already matches the suggestion."}
              </div>
            </div>
            <button className="wq-dds-btn" disabled={busy} onClick={onPromote}>
              {busy ? "Working…" : "Accept derived scope →"}
            </button>
          </div>
          {note && <div className="wq-dds-note">{note}</div>}

          <div className="wq-dds-sec">Agency twins</div>
          <div className="wq-dds-list">
            {sug.agencies.map((a) => (
              <div key={a.name} className="wq-dds-item">
                <div className="wq-dds-item-top">
                  <span className="wq-dds-name">{a.name}</span>
                  {a.tier && <span className="wq-dds-tier">{a.tier}</span>}
                </div>
                <div className="wq-dds-why">{a.rationale}</div>
                {Array.isArray(a.twinned_customers) && a.twinned_customers.length > 0 && (
                  <div className="wq-dds-chips">
                    {a.twinned_customers.map((c, i) => (
                      <span key={i} className="wq-dds-cust">{c}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="wq-dds-sec">
            Verticals <span className="wq-dds-sec-note">— burden density is the one human knob</span>
          </div>
          <div className="wq-dds-list">
            {sug.verticals.map((v) => {
              const def = vlibMap[v.naics]?.burden_density;
              const eff = effective(v.naics);
              const overridden = overrides[v.naics] != null;
              const shown = edits[v.naics] != null ? edits[v.naics] : eff ?? "";
              return (
                <div key={v.naics} className="wq-dds-item">
                  <div className="wq-dds-item-top">
                    <span className="wq-dds-name">{v.label}</span>
                    <span className="wq-dds-burden">
                      <label>burden</label>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={shown}
                        onChange={(e) =>
                          setEdits((prev) => ({ ...prev, [v.naics]: e.target.value }))
                        }
                        onBlur={() => onBurdenBlur(v.naics)}
                      />
                      {def != null && (
                        <span className="wq-dds-def">
                          {overridden ? `default ${def}` : "default"}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="wq-dds-why">{v.rationale}</div>
                </div>
              );
            })}
          </div>

          <div className="wq-dds-foot">
            Agencies and verticals are derived from your customer base and refresh automatically.
            Add scope manually only when launching a new product line the customer base
            doesn&rsquo;t yet reflect.
          </div>
        </>
      )}
    </div>
  );
}
