import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useOip } from '../../lib/oip'
import TradesApp from './TradesApp'

// Shows the trades app when the logged-in tenant has tenants.simple_mode = true.
// Anything else — false, null, a failed lookup, no OIP — renders `children`
// (the existing <Layout />) exactly as before.
export default function TradesGate({ children }) {
  const { selectedOip, loading } = useOip()
  const tenantId = selectedOip?.tenant_id || null
  const [mode, setMode] = useState('checking')

  useEffect(() => {
    if (loading) return
    if (!tenantId) { setMode('normal'); return }
    let cancelled = false
    setMode('checking')
    supabase
      .from('tenants')
      .select('simple_mode')
      .eq('id', tenantId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        setMode(!error && data?.simple_mode === true ? 'trades' : 'normal')
      })
    return () => { cancelled = true }
  }, [loading, tenantId])

  if (loading || mode === 'checking') {
    return (
      <div className="app">
        <div style={{ padding: '120px 0', textAlign: 'center', color: 'var(--ink-fade)' }}>Loading…</div>
      </div>
    )
  }
  return mode === 'trades' ? <TradesApp /> : children
}
