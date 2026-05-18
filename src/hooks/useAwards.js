import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * useAwards — loads USASpending award intelligence for a signal.
 *
 * Returns:
 *   candidates   enriched awards sorted by req_similarity desc (for matrix)
 *   recipients   grouped by recipient for leaderboard view
 *   summary      aggregate stats
 *   loading      bool
 *   hasData      bool
 */
export function useAwards(signalId, oipId) {
  const [candidates, setCandidates] = useState([])
  const [recipients, setRecipients] = useState([])
  const [summary, setSummary]       = useState(null)
  const [loading, setLoading]       = useState(false)

  useEffect(() => {
    if (!signalId || !oipId) return
    let cancelled = false

    setLoading(true)
    setCandidates([])
    setRecipients([])
    setSummary(null)

    supabase
      .from('signal_awards')
      .select('*')
      .eq('signal_id', signalId)
      .eq('oip_id', oipId)
      .in('match_confidence', ['high', 'medium'])
      .order('req_similarity', { ascending: false, nullsFirst: false })
      .order('award_amount', { ascending: false, nullsFirst: false })
      .then(({ data }) => {
        if (cancelled) return
        const rows = data || []

        if (rows.length === 0) {
          setLoading(false)
          return
        }

        // Candidates — enriched first, then unenriched
        const enriched   = rows.filter(r => r.req_similarity != null)
        const unenriched = rows.filter(r => r.req_similarity == null)
        setCandidates([...enriched, ...unenriched])

        // Recipients — grouped for leaderboard
        const byRecipient = {}
        rows.forEach(a => {
          const key = (a.recipient_name || 'Unknown').trim()
          if (!byRecipient[key]) {
            byRecipient[key] = {
              recipient_name:   key,
              award_count:      0,
              total_awarded:    0,
              any_recompete:    false,
              awarding_agency:  a.awarding_agency_name || '',
              awarding_office:  a.awarding_office_name || '',
              match_confidence: a.match_confidence,
              match_basis:      a.match_basis,
              best_similarity:  null,
            }
          }
          const r = byRecipient[key]
          r.award_count++
          r.total_awarded += a.award_amount || 0
          if (a.is_recompete_signal) r.any_recompete = true
          if (a.req_similarity != null && (r.best_similarity == null || a.req_similarity > r.best_similarity)) {
            r.best_similarity = a.req_similarity
          }
        })

        const grouped = Object.values(byRecipient)
          .sort((a, b) => {
            const simA = a.best_similarity ?? -1
            const simB = b.best_similarity ?? -1
            if (simB !== simA) return simB - simA
            return b.total_awarded - a.total_awarded
          })
          .slice(0, 10)

        setRecipients(grouped)

        // Summary
        const amounts      = rows.map(a => a.award_amount).filter(v => v != null && v > 0)
        const anyRecompete = rows.some(a => a.is_recompete_signal)

        setSummary({
          total_rows:        rows.length,
          unique_recipients: Object.keys(byRecipient).length,
          enriched_count:    enriched.length,
          min_amount:        amounts.length ? Math.min(...amounts) : null,
          max_amount:        amounts.length ? Math.max(...amounts) : null,
          avg_amount:        amounts.length ? amounts.reduce((a, b) => a + b, 0) / amounts.length : null,
          any_recompete:     anyRecompete,
          top_similarity:    enriched.length ? enriched[0].req_similarity : null,
          match_confidence:  rows[0]?.match_confidence || 'medium',
          match_basis:       rows[0]?.match_basis || '',
          agency:            rows[0]?.awarding_agency_name || '',
        })

        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [signalId, oipId])

  return { candidates, recipients, summary, loading, hasData: candidates.length > 0 }
}
