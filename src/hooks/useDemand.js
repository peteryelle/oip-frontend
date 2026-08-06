// src/hooks/useDemand.js
//
// Reads the Derived Demand grid for one OIP.
//
// Cells (agency x vertical) used to live in derived_demand_cells, written by
// the retired dd_sweep populate/calibrate job. DD v2 (busdev_dd_v2_collect /
// busdev_dd_v2_brief) never writes to that table — it does per-award
// entailment scoring straight onto oip_signals.b2b_busdev, with no separate
// aggregation step. Reading derived_demand_cells for a DD v2 tenant meant
// this grid was permanently empty regardless of how much real data existed
// underneath it in the awards table below.
//
// Fix: build the same agency x NAICS aggregate live, client-side, from
// oip_signals.b2b_busdev (agency, naics_code, current_value, b2b_score).
// buildGrid() below is UNCHANGED — it consumes the same cell shape either
// way, so this is a data-source swap, not a rendering rewrite.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

// Matches useAwards.js's ARCHIVE_BELOW — a cell's "hit rate" is the fraction
// of its sampled candidates that cleared the same fit floor the awards list
// uses to decide what counts as a real opportunity vs. archived noise.
const HIGH_FIT_FLOOR = 40;

export function useDemand(oipId) {
  const [cells, setCells] = useState([]);
  const [vlib, setVlib] = useState({}); // naics -> { label }
  const [alib, setAlib] = useState({}); // name  -> { acronym, tier }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!oipId) return;
    setLoading(true);
    setError(null);

    const [sigRes, vRes, aRes] = await Promise.all([
      supabase
        .from("oip_signals")
        .select(`
          b2b_busdev, b2b_score, relevance_status,
          signals!inner ( signal_kind )
        `)
        .eq("oip_id", oipId)
        .in("signals.signal_kind", ["award", "notice"])
        .eq("relevance_status", "active")
        .not("b2b_busdev", "is", null),
      supabase.from("dd_vertical_library").select("naics, label").eq("is_active", true),
      supabase.from("dd_agency_library").select("name, acronym, tier").eq("is_active", true),
    ]);

    const err = sigRes.error || vRes.error || aRes.error;
    if (err) {
      setError(err);
      setCells([]);
      setLoading(false);
      return;
    }

    // Aggregate per (agency, naics). Dollar figures are the sum of every
    // scored candidate's current_value in that pocket — the addressable
    // market DD v2 evaluated, regardless of fit — matching the grid's
    // existing caption ("total federal contract spend ... not your
    // pipeline"). hit_rate is the share that cleared HIGH_FIT_FLOOR.
    const agg = new Map(); // "agency\0naics" -> { agency, naics, spend, samples, highFit, naicsLabel }
    for (const row of sigRes.data || []) {
      const b = row.b2b_busdev || {};
      const agency = b.agency;
      const naics = b.naics_code;
      if (!agency || !naics) continue; // can't place on the grid without both axes
      const key = `${agency}\u0000${naics}`;
      const cell = agg.get(key) || {
        agency,
        naics,
        spend: 0,
        samples: 0,
        highFit: 0,
        naicsLabel: b.naics_description || null,
      };
      cell.spend += Number(b.current_value) || 0;
      if (row.b2b_score != null) {
        cell.samples += 1;
        if (row.b2b_score >= HIGH_FIT_FLOOR) cell.highFit += 1;
      }
      agg.set(key, cell);
    }

    const cellRows = [...agg.values()].map((c) => ({
      agency_name: c.agency,
      agency_tier: "",
      naics: c.naics,
      naics_label: c.naicsLabel,
      addressable_spend: c.spend,
      samples_scored: c.samples,
      high_fit_count: c.highFit,
      hit_rate: c.samples > 0 ? c.highFit / c.samples : null,
      burden_density: null,
      priority_rank: null,
    }));

    setVlib(Object.fromEntries((vRes.data || []).map((v) => [v.naics, v])));
    setAlib(Object.fromEntries((aRes.data || []).map((a) => [a.name, a])));
    setCells(cellRows);
    setLoading(false);
  }, [oipId]);

  useEffect(() => {
    load();
  }, [load]);

  const grid = useMemo(() => buildGrid(cells, vlib, alib), [cells, vlib, alib]);

  return { ...grid, loading, error, refetch: load, cellCount: cells.length };
}

function buildGrid(cells, vlib, alib) {
  const map = new Map(); // "name|naics" -> enriched cell
  const agencyAgg = new Map();
  const vertAgg = new Map();

  for (const c of cells) {
    const spend = Number(c.addressable_spend) || 0;
    const samples = c.samples_scored || 0;
    const hit = c.hit_rate == null ? null : Number(c.hit_rate);
    const pct = samples > 0 && hit != null ? Math.round(hit * 100) : null;

    map.set(`${c.agency_name}|${c.naics}`, {
      spend,
      scored: samples > 0,
      samples,
      pct,
      rank: c.priority_rank,
    });

    const a = agencyAgg.get(c.agency_name) || { spend: 0, minRank: Infinity };
    a.spend += spend;
    a.minRank = Math.min(a.minRank, c.priority_rank ?? Infinity);
    a.tier = alib[c.agency_name]?.tier || c.agency_tier || "";
    a.acronym = alib[c.agency_name]?.acronym || c.agency_name;
    agencyAgg.set(c.agency_name, a);

    const v = vertAgg.get(c.naics) || { spend: 0 };
    v.spend += spend;
    // A live-scored row's own naics_description (e.g. "Advertising Agencies")
    // is a more reliable label than the curated library, which was built
    // against the old pipeline's NAICS set and may not have every code DD v2
    // now surfaces. Library still wins if a row carried no description.
    v.label = c.naics_label || vlib[c.naics]?.label || c.naics;
    vertAgg.set(c.naics, v);
  }

  // Agencies down the side, verticals across the top — both ordered by total
  // addressable spend desc (where the money is).
  const agencies = [...agencyAgg.entries()]
    .map(([name, a]) => ({ name, ...a }))
    .sort((x, y) => y.spend - x.spend);
  const verticals = [...vertAgg.entries()]
    .map(([naics, v]) => ({ naics, ...v }))
    .sort((x, y) => y.spend - x.spend);

  const cellAt = (name, naics) => map.get(`${name}|${naics}`) || null;
  const colTotals = Object.fromEntries(verticals.map((v) => [v.naics, v.spend]));

  return { agencies, verticals, cellAt, colTotals };
}
