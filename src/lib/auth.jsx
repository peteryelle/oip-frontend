import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
    })

    // Listen for changes.
    //
    // supabase-js re-emits auth events when a tab regains focus (TOKEN_REFRESHED
    // / SIGNED_IN), even though nothing changed. Setting state unconditionally
    // hands down a NEW user object each time, which re-runs the memberships
    // effect below, flips loading true, and unmounts everything downstream —
    // OipProvider reloads, the market list remounts, and any open drawer is
    // lost. Only update when the identity actually changed.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(prev => (prev?.access_token === sess?.access_token ? prev : sess))
      setUser(prev => (prev?.id === sess?.user?.id ? prev : (sess?.user ?? null)))
    })

    return () => subscription.unsubscribe()
  }, [])

  // Load tenant memberships when user changes
  useEffect(() => {
    if (!user) {
      setMemberships([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const { data, error } = await supabase
        .from('tenant_members')
        .select('tenant_id, role, tenants:tenant_id (id, slug, name)')
        .eq('user_id', user.id)
      if (cancelled) return
      if (error) {
        console.error('Loading memberships:', error)
        setMemberships([])
      } else {
        setMemberships(data || [])
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [user])

  const signOut = () => supabase.auth.signOut()

  const value = { session, user, memberships, loading, signOut }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
