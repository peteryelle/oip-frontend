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

export function useAwards(oipId, opts = {}) {
  const { sort = "score", disposition = "all", withinMonths = null, search = "" } = opts;

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
    if (disposition !== "all") list = list.filter((a) => a.disposition === disposition);
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
  }, [rows, sort, disposition, withinMonths, search]);

  return { awards, loading, error, refetch: load, total: rows.length };
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
