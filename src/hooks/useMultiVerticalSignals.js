/**
 * useMultiVerticalSignals
 * =======================
 * Fetches oip_signals across ALL OIPs for the current tenant,
 * enriched with vertical slug/name for source labeling.
 *
 * Used by MultiVerticalSignalList when the tenant has OIPs
 * spanning multiple verticals.
 *
 * Returns:
 *   signals   — flat array of oip_signal rows, each with
 *               .oips.verticals.slug for source identification
 *   loading   — bool
 *   refresh   — function to re-fetch
 */

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useMultiVerticalSignals(oips, statusFilter = '') {
  const [signals, setSignals]   = useState([])
  const [loading, setLoading]   = useState(true)

  const oipIds = (oips || []).map(o => o.id)

  const fetch = useCallback(async () => {
    if (!oipIds.length) {
      setSignals([])
      setLoading(false)
      return
    }

    setLoading(true)
    let q = supabase
      .from('oip_signals')
      .select(`
        oip_id, signal_id, signal_tier, signal_value,
        matched_keywords, matched_groups,
        match_reason, text_excerpt, status, notes,
        scored_at, scores,
        signals:signal_id (
          id, title, source_name, source, state,
          doc_url, doc_type, meeting_date, scraped_at,
          full_text_storage_path, portal_id, metadata
        ),
        oips:oip_id (
          id, name, slug,
          verticals:vertical_id ( id, slug, name )
        )
      `)
      .in('oip_id', oipIds)
      .order('scored_at', { ascending: false })
      .limit(2500)

    if (statusFilter) q = q.eq('status', statusFilter)

    const { data, error } = await q
    if (error) console.error('useMultiVerticalSignals:', error)
    setSignals(data || [])
    setLoading(false)
  }, [oipIds.join(','), statusFilter])

  useEffect(() => { fetch() }, [fetch])

  return { signals, loading, refresh: fetch }
}
