// src/hooks/useAwards.js
//
// Reads the B2B Bus Dev (Awards-mode) feed for one OIP. Award signals are
// signals with signal_kind='award'; their scoring lives on oip_signals
// (b2b_busdev jsonb + scalar extracts). No separate scores table.
//
// ADJUST: point this import at your existing configured Supabase client.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const SORTERS = {
  score:     (a, b) => (b.score ?? -1) - (a.score ?? -1),
  amount:    (a, b) => (b.amount ?? 0) - (a.amount ?? 0),
  // soonest recompete first (smallest non-negative months to PoP end)
  recompete: (a, b) => rank(a.monthsToPopEnd) - rank(b.monthsToPopEnd),
};
const rank = (m) => (m == null || m < 0 ? Number.POSITIVE_INFINITY : m);

// Two-axis tags the B2B view filters and flags by. Award axis: new vs old
// (pop_start). Recompete axis: soon vs outside-window (pop_end). Only active
// awards (future or open-ended PoP) are tagged; past-PoP awards are untagged
// and therefore excluded from the view.
export function awardTags(a, recompeteDays = 180, awardDays = 120) {
  const active = a.daysToPopEnd == null || a.daysToPopEnd >= 0;
  if (!active) {
    return { active: false, awardedNew: false, awardedOld: false, recompeteSoon: false, recompeteOutside: false };
  }
  const awardedNew =
    a.daysSincePopStart != null && a.daysSincePopStart >= 0 && a.daysSincePopStart <= awardDays;
  const recompeteSoon =
    a.daysToPopEnd != null && a.daysToPopEnd >= 0 && a.daysToPopEnd <= recompeteDays;
  return {
    active: true,
    awardedNew,
    awardedOld: !awardedNew,
    recompeteSoon,
    recompeteOutside: !recompeteSoon,
  };
}

export function useAwards(oipId, opts = {}) {
  const {
    sort = "score",
    disposition = "all",
    withinMonths = null,
    recompeteDays = null,
    awardDays = null,
    states = null,
    search = "",
    includeArchived = false,
    pocket = null,
  } = opts;

  // Scores below this are archived (low delivery-fit noise) and hidden by default.
  const ARCHIVE_BELOW = 40;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!oipId) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("oip_signals")
      .select(`
        signal_id, status,
        b2b_busdev, b2b_score, disposition, motion, displacement_difficulty,
        incumbent_method, prime_uei, why_now,
        signals!inner ( id, title, doc_url, source_meta, signal_kind )
      `)
      .eq("oip_id", oipId)
      .eq("signals.signal_kind", "award")
      .order("b2b_score", { ascending: false, nullsFirst: false });

    if (error) {
      setError(error);
      setRows([]);
    } else {
      setRows((data || []).map(normalize));
    }
    setLoading(false);
  }, [oipId]);

  useEffect(() => {
    load();
  }, [load]);

  const awards = useMemo(() => {
    let list = rows.slice();
    if (!includeArchived) {
      list = list.filter((a) => a.score != null && a.score >= ARCHIVE_BELOW);
    }
    // Pocket scope: a clicked demand-grid cell (sub-agency × NAICS).
    if (pocket && pocket.agency && pocket.naics) {
      list = list.filter((a) => a.subAgency === pocket.agency && a.naics === pocket.naics);
    }
    if (disposition !== "all") list = list.filter((a) => a.disposition === disposition);
    if (states) {
      const rd = recompeteDays ?? 180;
      const ad = awardDays ?? 120;
      list = list.filter((a) => {
        const t = awardTags(a, rd, ad);
        if (!t.active) return false;
        return (
          (states.awardedNew && t.awardedNew) ||
          (states.awardedOld && t.awardedOld) ||
          (states.recompeteSoon && t.recompeteSoon) ||
          (states.recompeteOutside && t.recompeteOutside)
        );
      });
    }
    if (withinMonths != null) {
      list = list.filter(
        (a) => a.monthsToPopEnd != null && a.monthsToPopEnd >= 0 && a.monthsToPopEnd <= withinMonths
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          (a.recipient || "").toLowerCase().includes(q) ||
          (a.agency || "").toLowerCase().includes(q) ||
          (a.piid || "").toLowerCase().includes(q)
      );
    }
    list.sort(SORTERS[sort] || SORTERS.score);
    return list;
  }, [rows, sort, disposition, withinMonths, recompeteDays, awardDays, states, search, includeArchived, pocket]);

  const archivedCount = useMemo(
    () => rows.filter((a) => a.score == null || a.score < ARCHIVE_BELOW).length,
    [rows]
  );

  return { awards, loading, error, refetch: load, total: rows.length, archivedCount };
}

function normalize(r) {
  const sig = r.signals || {};
  const meta = sig.source_meta || {};
  return {
    signalId: r.signal_id,
    status: r.status,
    title: sig.title || meta.piid || "",
    url: sig.doc_url || "",
    piid: meta.piid || "",
    awardId: meta.usaspending_award_id || "",
    recipient: meta.recipient_name || "",
    uei: meta.recipient_uei || r.prime_uei || "",
    agency: meta.awarding_agency || "",
    subAgency: meta.awarding_sub_agency || "",
    naics: meta.naics || "",
    psc: meta.psc || "",
    amount: toNum(meta.award_amount),
    popStart: meta.pop_start || null,
    popEnd: meta.pop_end || null,
    monthsToPopEnd: monthsTo(meta.pop_end),
    daysToPopEnd: daysFromToday(meta.pop_end),
    daysSincePopStart: daysSince(meta.pop_start),
    score: r.b2b_score,
    disposition: r.disposition || null,
    motion: r.motion || null,
    difficulty: r.displacement_difficulty || null,
    incumbentMethod: r.incumbent_method || null,
    whyNow: r.why_now || null,
    busdev: r.b2b_busdev || {},
  };
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function monthsTo(iso) {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  return (d.getUTCFullYear() - now.getUTCFullYear()) * 12 + (d.getUTCMonth() - now.getUTCMonth());
}

// Days from today to an ISO date: positive = future, negative = past.
function daysFromToday(iso) {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((d.getTime() - today) / 86400000);
}
const daysSince = (iso) => {
  const d = daysFromToday(iso);
  return d == null ? null : -d;
};
