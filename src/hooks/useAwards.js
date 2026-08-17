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

// The confidence dropdown filters on these exact labels; the handler emits
// high|medium|low. Previously hardcoded to "✓ High" on every recompete, which
// made the filter a no-op.
const CONFIDENCE_LABEL = {
  high: "✓ High",
  medium: "⚠️ Borderline",
  low: "✗ Low",
};

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
    confidenceFilter = "all",
    includeArchived = false,
    includeStale = false,
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
    let query = supabase
      .from("oip_signals")
      .select(`
        signal_id, status, relevance_status,
        b2b_busdev, b2b_score, disposition, motion, displacement_difficulty,
        incumbent_method, prime_uei, why_now, data_confidence_flag,
        verification_status, verification_modifier, verified_score,
        installer_name, evidence_url, verification_reasoning, verified_at,
        signals!inner ( id, title, doc_url, source_meta, source_name, signal_kind )
      `)
      .eq("oip_id", oipId)
      .in("signals.signal_kind", ["award", "notice"]);
    // Relevance: hide rows the latest rescore didn't reproduce, unless asked (migration 008)
    if (!includeStale) query = query.eq("relevance_status", "active");
    query = query.order("b2b_score", { ascending: false, nullsFirst: false });
    const { data, error } = await query;

    if (error) {
      setError(error);
      setRows([]);
    } else {
      setRows((data || []).map(normalize));
    }
    setLoading(false);
  }, [oipId, includeStale]);

  useEffect(() => {
    load();
  }, [load]);

  const awards = useMemo(() => {
    let list = rows.slice();
    
    // Calculate total value per prime (incumbent_name)
    const primeValueMap = {};
    list.forEach((a) => {
      const prime = a.recipient; // recipient = incumbent_name for recompetes
      if (prime && a.amount) {
        primeValueMap[prime] = (primeValueMap[prime] || 0) + a.amount;
      }
    });
    
    // Attach primeTotal to each award
    list = list.map((a) => ({
      ...a,
      primeTotal: primeValueMap[a.recipient] || null,
    }));
    
    // Two different reasons a row is hidden, deliberately not merged:
    //   gated   — the entailment gate rejected it. Never a candidate.
    //   low     — it passed the gate but scored below the floor.
    // Calling gated rows "archived (≤39)" reads as something the user set
    // aside, when it is the product's own judgement that the work does not
    // need what they sell.
    if (!includeArchived) {
      list = list.filter((a) => !a.gated && a.score != null && a.score >= ARCHIVE_BELOW);
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
    if (confidenceFilter !== "all") {
      list = list.filter((a) => a.dataConfidenceFlag === confidenceFilter);
    }
    list.sort(SORTERS[sort] || SORTERS.score);
    return list;
  }, [rows, sort, disposition, withinMonths, recompeteDays, awardDays, states, search, confidenceFilter, includeArchived, pocket]);

  const gatedCount = useMemo(() => rows.filter((a) => a.gated).length, [rows]);

  const archivedCount = useMemo(
    () => rows.filter((a) => !a.gated && (a.score == null || a.score < ARCHIVE_BELOW)).length,
    [rows]
  );

  return {
    awards, loading, error, refetch: load,
    total: rows.length, archivedCount, gatedCount,
  };
}

function normalize(r) {
  const sig = r.signals || {};
  const meta = sig.source_meta || {};
  const busdev = r.b2b_busdev || {};
  
  // Recompete (govcon_dd_v2): extract from b2b_busdev.
  //
  // The handler's key names changed with the gate/size rewrite. Notably
  // current_end_date -> pop_end_date and months_until_end is no longer written,
  // so BOTH are derived from pop_end_date here. daysToPopEnd used to be
  // hardcoded null, which made awardTags() treat every recompete as inactive —
  // that is why the table read "Outside window · —" on every row.
  if (busdev.incumbent_name) {
    const popEnd = busdev.pop_end_date || busdev.current_end_date || null;
    const ent = busdev.entailment || {};
    // Gated = the entailment gate rejected it. Distinct from a low score: the
    // work does not need what the tenant sells, so it was never a candidate.
    const gated = busdev.scores?.gated === true || r.disposition === "No";
    return {
      signalId: r.signal_id,
      status: r.status,
      title: busdev.incumbent_name + " - " + (busdev.agency || ""),
      url: "",
      piid: busdev.piid || "",
      awardId: "",
      recipient: busdev.incumbent_name || "",
      uei: busdev.incumbent_uei || "",
      agency: busdev.agency || "",
      subAgency: busdev.sub_agency || "",
      naics: busdev.naics_code || "",
      psc: busdev.psc_code || "",
      amount: toNum(busdev.current_value),
      popStart: null,
      popEnd,
      monthsToPopEnd: monthsTo(popEnd),
      daysToPopEnd: daysFromToday(popEnd),
      daysSincePopStart: null,
      score: r.b2b_score,
      gated,
      disposition: r.disposition || null,
      motion: r.motion || null,
      difficulty: ent.delivery_mode || r.displacement_difficulty || null,
      incumbentMethod: ent.incumbent_method || null,
      whyNow: busdev.why_now || null,
      dataConfidenceFlag: CONFIDENCE_LABEL[ent.confidence] || CONFIDENCE_LABEL[busdev.scope_confidence] || "✗ Low",
      busdev: busdev,
      relevanceStatus: r.relevance_status || "active",
      verification: r.verification_status ? {
        installer_status: r.verification_status,
        installer_name: r.installer_name || null,
        evidence_url: r.evidence_url || null,
        reasoning: r.verification_reasoning || null,
        modifier: r.verification_modifier ?? null,
        verifiedScore: r.verified_score ?? null,
        verifiedAt: r.verified_at || null,
      } : null,
    };
  }
  
  // Award (old USASpending): extract from source_meta
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
    dataConfidenceFlag: r.data_confidence_flag || "✗ Low",
    busdev: r.b2b_busdev || {},
    relevanceStatus: r.relevance_status || "active",
    verification: null,
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
