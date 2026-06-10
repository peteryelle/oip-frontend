// src/hooks/useDemand.js
//
// Reads the Derived Demand grid for one OIP. Cells (agency x vertical) live in
// derived_demand_cells and are machine-owned (populate/calibrate write them);
// this is a read-only readout. Vertical labels come from dd_vertical_library and
// agency acronyms from dd_agency_library — joined client-side since the libraries
// are tiny and there's no FK to embed on (naics/name are plain text keys).
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

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
    const [cellRes, vRes, aRes] = await Promise.all([
      supabase
        .from("derived_demand_cells")
        .select(
          "agency_name, agency_tier, naics, addressable_spend, " +
            "samples_scored, high_fit_count, hit_rate, burden_density, priority_rank"
        )
        .eq("oip_id", oipId)
        .order("priority_rank", { ascending: true, nullsFirst: false }),
      supabase.from("dd_vertical_library").select("naics, label").eq("is_active", true),
      supabase.from("dd_agency_library").select("name, acronym, tier").eq("is_active", true),
    ]);

    const err = cellRes.error || vRes.error || aRes.error;
    if (err) {
      setError(err);
      setCells([]);
    } else {
      setVlib(Object.fromEntries((vRes.data || []).map((v) => [v.naics, v])));
      setAlib(Object.fromEntries((aRes.data || []).map((a) => [a.name, a])));
      setCells(cellRes.data || []);
    }
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
    v.label = vlib[c.naics]?.label || c.naics;
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
