/**
 * useKeywordTierMap
 * ==================
 * Loads the active sentinel's keyword vocabulary for an OIP and returns it
 * as a Map<keyword_lowercase, tier> ('tier1_strong' | 'tier1' | 'tier2').
 *
 * Used by client-side signal scoring (scoreSignalRow) so the numeric score
 * badges reflect the sentinel's real, live keyword tiers rather than a
 * hardcoded weighting — tuning keywords in the sentinel config propagates
 * to the UI automatically, no redeploy needed.
 *
 * Returns a plain object (not array) for O(1) lookups: { [keyword]: tier }
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useKeywordTierMap(oipId) {
  const [keywordTierMap, setKeywordTierMap] = useState({})

  useEffect(() => {
    let cancelled = false
    if (!oipId) { setKeywordTierMap({}); return }

    ;(async () => {
      const { data: sentinels } = await supabase
        .from('sentinels')
        .select('id')
        .eq('oip_id', oipId)
        .eq('is_active', true)
        .limit(1)

      const sentinelId = sentinels?.[0]?.id
      if (!sentinelId) { if (!cancelled) setKeywordTierMap({}); return }

      const { data: kws, error } = await supabase
        .from('sentinel_keywords')
        .select('keyword, tier')
        .eq('sentinel_id', sentinelId)

      if (error) { console.error('useKeywordTierMap:', error); return }
      if (cancelled) return

      const map = Object.fromEntries((kws || []).map(k => [k.keyword.toLowerCase(), k.tier]))
      setKeywordTierMap(map)
    })()

    return () => { cancelled = true }
  }, [oipId])

  return keywordTierMap
}
