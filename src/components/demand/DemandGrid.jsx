// src/components/demand/DemandGrid.jsx
//
// Derived Demand readout: agencies (rows) x verticals (cols), each cell showing
// addressable spend shaded by relevance (the calibrated hit rate). Verticals are
// labeled in plain language (no NAICS), agencies as acronyms. Self-contained —
// takes oipId, owns its data via useDemand. Read-only; cells are machine-owned.
import React from "react";
import { useDemand } from "../../hooks/useDemand";
import "./demand.css";

function money(b) {
  if (!b || b <= 0) return "";
  if (b >= 1e9) return `$${(b / 1e9).toFixed(1)}B`;
  if (b >= 1e6) return `$${Math.round(b / 1e6)}M`;
  return `$${Math.round(b / 1e3)}K`;
}

function bandClass(cell) {
  if (!cell || cell.spend <= 0) return "wq-dem-blank";
  if (!cell.scored) return "wq-dem-na";
  if (cell.pct >= 70) return "wq-dem-hi";
  if (cell.pct >= 40) return "wq-dem-mid";
  return "wq-dem-lo";
}

export default function DemandGrid({ oipId }) {
  const { agencies, verticals, cellAt, colTotals, loading, error, cellCount } =
    useDemand(oipId);

  if (loading) return <div className="wq-demand"><div className="wq-dem-empty">Loading…</div></div>;
  if (error)
    return (
      <div className="wq-demand">
        <div className="wq-dem-empty">Couldn&rsquo;t load the demand grid: {String(error.message || error)}</div>
      </div>
    );
  if (!cellCount || agencies.length === 0)
    return (
      <div className="wq-demand">
        <div className="wq-dem-empty">
          No demand cells yet. Run a <code>dd_sweep populate</code> for this OIP, then calibrate.
        </div>
      </div>
    );

  return (
    <div className="wq-demand">
      <div className="wq-dem-legend">
        <span className="wq-dem-key"><span className="wq-dem-sw wq-dem-hi" />High relevance ≥70%</span>
        <span className="wq-dem-key"><span className="wq-dem-sw wq-dem-mid" />Medium 40–69%</span>
        <span className="wq-dem-key"><span className="wq-dem-sw wq-dem-lo" />Low &lt;40%</span>
        <span className="wq-dem-key"><span className="wq-dem-sw wq-dem-na" />Not yet scored</span>
      </div>

      <div className="wq-dem-scroll">
        <table className="wq-dem-table">
          <thead>
            <tr>
              <th className="wq-dem-corner" />
              {verticals.map((v) => (
                <th key={v.naics} className="wq-dem-colhead" title={v.naics}>
                  {v.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agencies.map((a) => (
              <tr key={a.name}>
                <th className="wq-dem-rowhead" title={a.name}>
                  <span className="wq-dem-acr">{a.acronym}</span>
                  {a.tier ? <span className="wq-dem-tier">{a.tier}</span> : null}
                </th>
                {verticals.map((v) => {
                  const cell = cellAt(a.name, v.naics);
                  const cls = bandClass(cell);
                  const has = cell && cell.spend > 0;
                  return (
                    <td key={v.naics} className={`wq-dem-cell ${cls}`}>
                      {has ? (
                        <>
                          <div className="wq-dem-spend">{money(cell.spend)}</div>
                          <div className="wq-dem-pct">
                            {cell.scored ? `${cell.pct}%` : "—"}
                          </div>
                        </>
                      ) : (
                        <span className="wq-dem-dot">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="wq-dem-rowhead wq-dem-foot">Total</th>
              {verticals.map((v) => (
                <td key={v.naics} className="wq-dem-cell wq-dem-foot">
                  {money(colTotals[v.naics])}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
