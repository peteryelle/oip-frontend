// src/components/awards/B2BBusDevTab.jsx
//
// Self-contained "B2B Bus Dev" tab for the SAM Market Review. Owns its own
// data (useAwards), filter controls, card list, and detail drawer — so it
// touches none of the existing notice/DIB query or SignalDrawer.
import React, { useState } from "react";
import { useAwards } from "../../hooks/useAwards";
import AwardCard from "./AwardCard";
import B2BBusDevReport from "./B2BBusDevReport";
import "./awards.css";

export default function B2BBusDevTab({ oipId }) {
  const [sort, setSort] = useState("score");
  const [disposition, setDisposition] = useState("all");
  const [recompeteOnly, setRecompeteOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [openAward, setOpenAward] = useState(null);

  const { awards, loading, error, total } = useAwards(oipId, {
    sort,
    disposition,
    withinMonths: recompeteOnly ? 18 : null,
    search,
  });

  return (
    <div className="wq-awards">
      <div className="wq-awards-controls">
        <select value={disposition} onChange={(e) => setDisposition(e.target.value)}>
          <option value="all">All dispositions</option>
          <option value="Yes">Yes</option>
          <option value="Hold">Hold</option>
          <option value="Route-B2G">Route-B2G</option>
          <option value="No">No</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="score">Sort: B2B score</option>
          <option value="amount">Sort: award amount</option>
          <option value="recompete">Sort: recompete clock</option>
        </select>
        <label className="wq-check">
          <input
            type="checkbox"
            checked={recompeteOnly}
            onChange={(e) => setRecompeteOnly(e.target.checked)}
          />
          Recompete ≤18mo
        </label>
        <input
          type="search"
          placeholder="Search prime or agency…"
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
          Couldn’t load awards: {String(error.message || error)}
        </div>
      )}

      {!loading && !error && awards.length === 0 && (
        <div className="wq-awards-empty">
          No scored awards yet. Queue a <code>busdev</code> job for this OIP and run the dispatcher.
        </div>
      )}

      <div className="wq-awards-list">
        {awards.map((a) => (
          <AwardCard key={a.signalId} award={a} onOpen={setOpenAward} />
        ))}
      </div>

      {openAward && (
        <div className="wq-drawer-overlay" onClick={() => setOpenAward(null)}>
          <div className="wq-drawer" onClick={(e) => e.stopPropagation()}>
            <button
              className="wq-drawer-close"
              onClick={() => setOpenAward(null)}
              aria-label="Close"
            >
              ×
            </button>
            <B2BBusDevReport award={openAward} />
          </div>
        </div>
      )}
    </div>
  );
}
