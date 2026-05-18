import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * useAwards — loads and groups USASpending award intelligence for a signal.
 *
 * Returns:
 *   recipients  list of recipients sorted by total_awarded desc (top 10)
 *   summary     aggregate stats: min/max/avg amount, recompete flag, confidence
 *   loading     bool
 *   hasData     bool — true if any medium/high confidence awards exist
 */
export function useAwards(signalId, oipId) {
  const [recipients, setRecipients] = useState([])
  const [summary, setSummary]       = useState(null)
  const [loading, setLoading]       = useState(false)

  useEffect(() => {
    if (!signalId || !oipId) return
    let cancelled = false

    setLoading(true)
    setRecipients([])
    setSummary(null)

    supabase
      .from('signal_awards')
      .select('*')
      .eq('signal_id', signalId)
      .eq('oip_id', oipId)
      .in('match_confidence', ['high', 'medium'])
      .order('award_amount', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        const rows = data || []

        if (rows.length === 0) {
          setLoading(false)
          return
        }

        // Group by recipient name
        const byRecipient = {}
        rows.forEach(a => {
          const key = (a.recipient_name || 'Unknown').trim()
          if (!byRecipient[key]) {
            byRecipient[key] = {
              recipient_name:  key,
              award_count:     0,
              total_awarded:   0,
              avg_awarded:     0,
              any_recompete:   false,
              awarding_agency: a.awarding_agency_name || '',
              awarding_office: a.awarding_office_name || '',
              match_confidence: a.match_confidence,
              match_basis:     a.match_basis,
              latest_pop_end:  null,
            }
          }
          const r = byRecipient[key]
          r.award_count++
          r.total_awarded += a.award_amount || 0
          if (a.is_recompete_signal) r.any_recompete = true
          if (a.pop_end_date && (!r.latest_pop_end || a.pop_end_date > r.latest_pop_end)) {
            r.latest_pop_end = a.pop_end_date
          }
        })

        const grouped = Object.values(byRecipient)
          .map(r => ({ ...r, avg_awarded: r.award_count ? r.total_awarded / r.award_count : 0 }))
          .sort((a, b) => b.total_awarded - a.total_awarded)
          .slice(0, 10)

        const amounts = rows.map(a => a.award_amount).filter(v => v != null && v > 0)
        const anyRecompete = rows.some(a => a.is_recompete_signal)

        setSummary({
          total_rows:        rows.length,
          unique_recipients: grouped.length,
          min_amount:        amounts.length ? Math.min(...amounts) : null,
          max_amount:        amounts.length ? Math.max(...amounts) : null,
          avg_amount:        amounts.length ? amounts.reduce((a, b) => a + b, 0) / amounts.length : null,
          any_recompete:     anyRecompete,
          match_confidence:  rows[0]?.match_confidence || 'low',
          match_basis:       rows[0]?.match_basis || '',
          agency:            rows[0]?.awarding_agency_name || '',
        })

        setRecipients(grouped)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [signalId, oipId])

  return {
    recipients,
    summary,
    loading,
    hasData: recipients.length > 0,
  }
}
