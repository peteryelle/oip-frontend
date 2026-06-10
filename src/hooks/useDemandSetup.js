// src/hooks/useDemandSetup.js
//
// Backs the Derived Demand setup page. Reads the active sentinel's pull_config
// (busdev_suggestion + the live busdev_agencies/busdev_naics + lock/source/date),
// the vertical library (burden defaults), and this OIP's burden overrides.
// Writes: saveBurden (upsert dd_burden_override — the one human knob) and
// promote (copy the suggestion into the live scope + enqueue a populate sweep).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useDemandSetup(oipId) {
  const [sentinelId, setSentinelId] = useState(null);
  const [pullConfig, setPullConfig] = useState({});
  const [vlib, setVlib] = useState([]); // [{ naics, label, burden_density }]
  const [overrides, setOverrides] = useState({}); // naics -> burden_density
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!oipId) return;
    setLoading(true);
    setError(null);
    const [sentRes, vRes, ovRes] = await Promise.all([
      supabase
        .from("sentinels")
        .select("id, pull_config")
        .eq("oip_id", oipId)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("dd_vertical_library")
        .select("naics, label, burden_density")
        .eq("is_active", true)
        .order("naics"),
      supabase.from("dd_burden_override").select("naics, burden_density").eq("oip_id", oipId),
    ]);

    const err = sentRes.error || vRes.error || ovRes.error;
    if (err) {
      setError(err);
    } else {
      setSentinelId(sentRes.data?.id || null);
      setPullConfig(sentRes.data?.pull_config || {});
      setVlib(vRes.data || []);
      setOverrides(
        Object.fromEntries((ovRes.data || []).map((o) => [o.naics, Number(o.burden_density)]))
      );
    }
    setLoading(false);
  }, [oipId]);

  useEffect(() => {
    load();
  }, [load]);

  // The one human knob: per-vertical burden override (survives re-derivation).
  const saveBurden = useCallback(
    async (naics, value) => {
      const v = Math.max(0, Math.min(1, Number(value)));
      if (!Number.isFinite(v)) return new Error("Invalid burden value");
      const { error: e } = await supabase
        .from("dd_burden_override")
        .upsert({ oip_id: oipId, naics, burden_density: v }, { onConflict: "oip_id,naics" });
      if (!e) setOverrides((prev) => ({ ...prev, [naics]: v }));
      return e || null;
    },
    [oipId]
  );

  // Accept derived scope: copy the suggestion into the live pull_config, unlock,
  // stamp source/date, then enqueue a populate sweep so the grid reshapes.
  const promote = useCallback(
    async (verticalId) => {
      const sug = pullConfig.busdev_suggestion;
      if (!sentinelId || !sug) return new Error("No suggestion to promote");
      const newPC = {
        ...pullConfig,
        busdev_agencies: (sug.agencies || []).map((a) => ({ name: a.name, tier: a.tier })),
        busdev_naics: (sug.verticals || []).map((v) => v.naics),
        busdev_source: "derived",
        busdev_locked: false,
        busdev_derived_at: sug.generated_at || new Date().toISOString(),
      };
      const { error: upErr } = await supabase
        .from("sentinels")
        .update({ pull_config: newPC })
        .eq("id", sentinelId);
      if (upErr) return upErr;
      const { error: jobErr } = await supabase.from("worker_jobs").insert({
        job_type: "dd_sweep",
        oip_id: oipId,
        vertical_id: verticalId,
        payload: { mode: "populate", oip_id: oipId },
      });
      await load();
      return jobErr || null;
    },
    [pullConfig, sentinelId, oipId, load]
  );

  // Timing windows for the B2B view (duration in days). The configure page
  // writes them; the Market Review B2B surface reads them to filter/flag.
  const saveWindows = useCallback(
    async ({ recompeteDays, awardDays }) => {
      if (!sentinelId) return new Error("No active sentinel");
      const cur = pullConfig.busdev_windows || {};
      const next = {
        recompete_days:
          recompeteDays != null ? Math.max(1, Math.round(Number(recompeteDays))) : cur.recompete_days ?? 180,
        award_recency_days:
          awardDays != null ? Math.max(1, Math.round(Number(awardDays))) : cur.award_recency_days ?? 120,
      };
      const newPC = { ...pullConfig, busdev_windows: next };
      const { error: e } = await supabase.from("sentinels").update({ pull_config: newPC }).eq("id", sentinelId);
      if (!e) setPullConfig(newPC);
      return e || null;
    },
    [pullConfig, sentinelId]
  );

  const windows = {
    recompeteDays: pullConfig.busdev_windows?.recompete_days ?? 180,
    awardDays: pullConfig.busdev_windows?.award_recency_days ?? 120,
  };

  return { sentinelId, pullConfig, vlib, overrides, windows, loading, error, refetch: load, saveBurden, saveWindows, promote };
}
