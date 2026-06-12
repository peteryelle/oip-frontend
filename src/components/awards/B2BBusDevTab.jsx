// src/components/awards/B2BBusDevTab.jsx
//
// Self-contained "B2B Bus Dev" tab for the SAM Market Review. Owns its own
// data (useAwards), filter controls, award TABLE, and detail drawer — so it
// touches none of the existing notice/DIB query or SignalDrawer.
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { useAwards } from "../../hooks/useAwards";
import AwardTable from "./AwardTable";
import B2BBusDevReport from "./B2BBusDevReport";
import DemandGrid from "../demand/DemandGrid";
import "./awards.css";

export default function B2BBusDevTab({ oipId, isDerived }) {
  const [disposition, setDisposition] = useState("all");
  const [states, setStates] = useState({
    awardedNew: true,
    awardedOld: true,
    recompeteSoon: true,
    recompeteOutside: true,
  });
  const toggle = (k) => setStates((s) => ({ ...s, [k]: !s[k] }));
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [openAward, setOpenAward] = useState(null);
  const [pocket, setPocket] = useState(null);
  const listRef = useRef(null);

  // When a demand-grid cell is clicked, scope the list and scroll to it.
  useEffect(() => {
    if (pocket && listRef.current) {
      listRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [pocket]);

  // Timing windows (duration days) configured on the Derived Demand page.
  const [windows, setWindows] = useState({ recompeteDays: 180, awardDays: 120 });
  useEffect(() => {
    if (!oipId) return;
    let live = true;
    (async () => {
      const { data } = await supabase
        .from("sentinels")
        .select("pull_config")
        .eq("oip_id", oipId)
        .eq("is_active", true)
        .maybeSingle();
      if (!live) return;
      const w = data?.pull_config?.busdev_windows || {};
      setWindows({
        recompeteDays: w.recompete_days ?? 180,
        awardDays: w.award_recency_days ?? 120,
      });
    })();
    return () => {
      live = false;
    };
  }, [oipId]);

  // Initial order is B2B score desc; the table's column headers re-sort locally.
  const { awards, loading, error, total, archivedCount } = useAwards(oipId, {
    sort: "score",
    disposition,
    states,
    recompeteDays: windows.recompeteDays,
    awardDays: windows.awardDays,
    search,
    includeArchived: showArchived,
    pocket,
  });

  return (
    <div className="wq-awards">
      {isDerived && (
        <div style={{ marginBottom: 20 }}>
          <DemandGrid oipId={oipId} onCellClick={setPocket} selected={pocket} />
        </div>
      )}

      <div ref={listRef} />
      {pocket && (
        <div className="wq-pocket-scope">
          <span>
            Showing <strong>{pocket.agencyLabel} × {pocket.naicsLabel}</strong>
          </span>
          <button className="wq-pocket-clear" onClick={() => setPocket(null)}>
            Clear filter &times;
          </button>
        </div>
      )}

      <div className="wq-awards-controls">
        <select value={disposition} onChange={(e) => setDisposition(e.target.value)}>
          <option value="all">All dispositions</option>
          <option value="Yes">Yes</option>
          <option value="Hold">Hold</option>
          <option value="Route-B2G">Route-B2G</option>
          <option value="No">No</option>
        </select>
        <span className="wq-state-filters">
          <span className="wq-state-lbl">Awarded</span>
          <label className="wq-check">
            <input type="checkbox" checked={states.awardedNew} onChange={() => toggle("awardedNew")} />
            new
          </label>
          <label className="wq-check">
            <input type="checkbox" checked={states.awardedOld} onChange={() => toggle("awardedOld")} />
            old
          </label>
          <span className="wq-state-lbl">Recompete</span>
          <label className="wq-check">
            <input type="checkbox" checked={states.recompeteSoon} onChange={() => toggle("recompeteSoon")} />
            soon
          </label>
          <label className="wq-check">
            <input
              type="checkbox"
              checked={states.recompeteOutside}
              onChange={() => toggle("recompeteOutside")}
            />
            outside window
          </label>
        </span>
        <label className="wq-check">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived (&le;39){archivedCount ? ` · ${archivedCount}` : ""}
        </label>
        <input
          type="search"
          placeholder="Search prime, agency, or PIID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="wq-awards-count">
        {loading
          ? "Loading…"
          : `${awards.length}${awards.length !== total ? ` of ${total}` : ""} award${
              awards.length === 1 ? "" : "s"
            }`}
      </div>

      {error && (
        <div className="wq-awards-empty">
          Couldn&rsquo;t load awards: {String(error.message || error)}
        </div>
      )}

      {!loading && !error && awards.length === 0 && (
        <div className="wq-awards-empty">
          {pocket ? (
            <>
              No actionable opportunities (score &ge; 40) in{" "}
              <strong>{pocket.agencyLabel} &times; {pocket.naicsLabel}</strong>.{" "}
              <button className="wq-pocket-clear" onClick={() => setPocket(null)}>
                Clear filter
              </button>{" "}
              to see the full list.
            </>
          ) : (
            <>
              No scored awards yet. Queue a <code>busdev</code> job for this OIP and run the dispatcher.
            </>
          )}
        </div>
      )}

      {!loading && !error && awards.length > 0 && (
        <AwardTable
          awards={awards}
          onRowClick={setOpenAward}
          recompeteDays={windows.recompeteDays}
          awardDays={windows.awardDays}
        />
      )}

      {openAward && (
        <div className="wq-drawer-overlay" onClick={() => setOpenAward(null)}>
          <div className="wq-drawer" onClick={(e) => e.stopPropagation()}>
            <button
              className="wq-drawer-close"
              onClick={() => setOpenAward(null)}
              aria-label="Close"
            >
              &times;
            </button>
            <B2BBusDevReport award={openAward} recompeteDays={windows.recompeteDays} />
          </div>
        </div>
      )}
    </div>
  );
}
