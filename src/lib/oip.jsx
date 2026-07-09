import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

const OipContext = createContext(null)

const STORAGE_KEY = 'oip:selected'

export function OipProvider({ children }) {
  const { memberships, user } = useAuth()
  const [oips, setOips] = useState([])
  const [selectedOipId, setSelectedOipId] = useState(null)
  const [loading, setLoading] = useState(true)

  // Load all OIPs across all the user's tenants
  useEffect(() => {
    if (!user || memberships.length === 0) {
      setOips([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const tenantIds = memberships.map(m => m.tenant_id)
      const { data, error } = await supabase
        .from('oips')
        .select(`
          id, slug, name, description, tenant_id, vertical_id,
          subscription_tier, status, derivation_grade,
          tenants:tenant_id (id, slug, name),
          verticals:vertical_id (id, slug, name)
        `)
        .in('tenant_id', tenantIds)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
      if (cancelled) return
      if (error) {
        console.error('Loading OIPs:', error)
        setOips([])
      } else {
        setOips(data || [])
        // Restore last selection or default to first OIP
        const savedId = localStorage.getItem(STORAGE_KEY)
        const valid = (data || []).find(o => o.id === savedId)
        setSelectedOipId(valid?.id || data?.[0]?.id || null)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [user, memberships])

  const selectedOip = oips.find(o => o.id === selectedOipId) || null

  const selectOip = (oipId) => {
    setSelectedOipId(oipId)
    localStorage.setItem(STORAGE_KEY, oipId)
  }

  const value = { oips, selectedOip, selectedOipId, selectOip, loading }
  return <OipContext.Provider value={value}>{children}</OipContext.Provider>
}

export function useOip() {
  const ctx = useContext(OipContext)
  if (!ctx) throw new Error('useOip must be used inside OipProvider')
  return ctx
}
