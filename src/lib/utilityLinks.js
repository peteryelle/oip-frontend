// Utility identity across lanes (frontend side).
//
// signal_utilities links every signal to canonical utilities (EIA-861 /
// PHMSA). This module batch-loads those links for the signals on screen and
// computes, per signal, whether the same utility has activity in ANOTHER
// lane (board meeting vs regulatory proceeding vs procurement) in the last
// 90 days — limited to signals this tenant's OIPs matched (oip_signals is
// tenant-scoped by RLS).
import { supabase } from './supabase'

export const UTILITY_BY_SIGNAL = new Map()   // signal_id -> [{ id, name, brand, ownership, state }]
export const CROSS_LANE = new Map()          // signal_id -> { count, lanes: ['regulatory', ...] }

const RELATED_WINDOW_DAYS = 90
const CHUNK = 100

export function laneOf(sig) {
  if (!sig) return 'other'
  if (sig.source === 'puc') return 'regulatory'
  if (/agenda|minutes|council/i.test(String(sig.doc_type || ''))) return 'board'
  return 'procurement'
}

export const LANE_LABELS = {
  regulatory: 'Regulatory proceeding',
  board: 'Board meeting',
  procurement: 'Procurement',
}

// "Town of Reading - (MA)" -> "Reading"; "Hull Municipal Light Plant - (MA)" -> "Hull Municipal Light Plant";
// "BOSTON GAS CO" -> "Boston Gas Co"
export function prettyUtilityName(name) {
  let n = String(name || '').replace(/\s*-\s*\([A-Z]{2}\)\s*$/, '').trim()
  n = n.replace(/^(town|city|village|borough) of\s+/i, '').replace(/,?\s+(town|city) of$/i, '')
  if (n === n.toUpperCase()) n = n.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase())
  return n
}

async function chunked(ids, fn) {
  const out = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = await fn(ids.slice(i, i + CHUNK))
    if (part) out.push(...part)
  }
  return out
}

/** Load links + cross-lane flags for a list of oip_signals rows ({ signal_id, signals }). */
export async function loadUtilityLinks(list) {
  const visible = (list || []).filter(s => s?.signal_id && s?.signals)
  if (!visible.length) return false
  const ids = [...new Set(visible.map(s => s.signal_id))]

  const mine = await chunked(ids, async part => {
    const { data } = await supabase
      .from('signal_utilities')
      .select('signal_id, utility_id, utilities:utility_id (id, name, parent_brand, ownership_type, state)')
      .in('signal_id', part)
    return data || []
  })
  if (!mine.length) return false

  for (const r of mine) {
    const u = r.utilities || {}
    const arr = UTILITY_BY_SIGNAL.get(r.signal_id) || []
    if (!arr.some(x => x.id === r.utility_id)) {
      arr.push({ id: r.utility_id, name: u.name, brand: u.parent_brand, ownership: u.ownership_type, state: u.state })
    }
    UTILITY_BY_SIGNAL.set(r.signal_id, arr)
  }

  // Other signals at the same utilities
  const utilIds = [...new Set(mine.map(r => r.utility_id))]
  const others = await chunked(utilIds, async part => {
    const { data } = await supabase
      .from('signal_utilities')
      .select('signal_id, utility_id, signals:signal_id (source, doc_type, meeting_date)')
      .in('utility_id', part)
    return data || []
  })

  // Tenant scope: only signals this tenant's OIPs matched.
  const otherIds = [...new Set(others.map(o => o.signal_id))]
  const tenantVisible = new Set(await chunked(otherIds, async part => {
    const { data } = await supabase.from('oip_signals').select('signal_id').in('signal_id', part)
    return (data || []).map(d => d.signal_id)
  }))

  const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - RELATED_WINDOW_DAYS)
  const byUtil = new Map()   // utility_id -> [{ signal_id, lane }]
  for (const o of others) {
    if (!tenantVisible.has(o.signal_id) || !o.signals) continue
    const d = o.signals.meeting_date ? new Date(o.signals.meeting_date) : null
    if (d && d < cutoff) continue
    const arr = byUtil.get(o.utility_id) || []
    arr.push({ signal_id: o.signal_id, lane: laneOf(o.signals) })
    byUtil.set(o.utility_id, arr)
  }

  for (const s of visible) {
    const lane = laneOf(s.signals)
    const utils = UTILITY_BY_SIGNAL.get(s.signal_id) || []
    const hits = new Map()
    for (const u of utils) {
      for (const o of byUtil.get(u.id) || []) {
        if (o.signal_id !== s.signal_id && o.lane !== lane) hits.set(o.signal_id, o.lane)
      }
    }
    if (hits.size) CROSS_LANE.set(s.signal_id, { count: hits.size, lanes: [...new Set(hits.values())] })
    else CROSS_LANE.delete(s.signal_id)
  }
  return true
}

export function relatedTitle(entry) {
  if (!entry) return ''
  const lanes = entry.lanes.map(l => (LANE_LABELS[l] || l).toLowerCase()).join(' and ')
  return `${entry.count} related ${entry.count === 1 ? 'signal' : 'signals'} at this utility (${lanes}) in the last 90 days`
}
