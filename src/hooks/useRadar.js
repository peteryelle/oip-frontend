// src/hooks/useRadar.js
import { useState, useEffect, useCallback } from 'react'

export function useRadar(supabase, oipId) {
  const [signals,  setSignals]  = useState([])
  const [config,   setConfig]   = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  const load = useCallback(async () => {
    if (!oipId) return
    setLoading(true)
    setError(null)
    try {
      const [sigRes, cfgRes] = await Promise.all([
        supabase
          .from('fed_pipeline_signals')
          .select('*')
          .eq('oip_id', oipId)
          .order('pop_end_date', { ascending: true }),
        supabase
          .from('oip_fed_radar_config')
          .select('*')
          .eq('oip_id', oipId)
          .single()
      ])
      if (sigRes.error) throw sigRes.error
      setSignals(sigRes.data || [])
      setConfig(cfgRes.data || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [supabase, oipId])

  useEffect(() => { load() }, [load])

  return { signals, config, loading, error, reload: load }
}
