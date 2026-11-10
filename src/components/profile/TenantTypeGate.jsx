// Sends owners and admins to Setup → Profile when their tenant has no
// tenant_type, where TenantTypeBlock shows the banner and the picker.
//
// Rendered inside Layout, above <Outlet />. It renders nothing for owners and
// admins (the banner lives on the Profile page). Members cannot set the type,
// so they are never redirected — that would lock them out — and see a short
// notice instead.
//
// Checks once per selected OIP and again whenever the type is saved, not on
// every navigation. If the lookup fails or the tenant has no canonical
// profile row, it does nothing: a missing row must never trap a user.
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useOip } from '../../lib/oip'
import { loadTenantType, TENANT_TYPE_EVENT } from '../../lib/tenantType'

// Pages reachable while the type is unset.
const ALLOWED_PREFIXES = ['/profile', '/account', '/help']

export default function TenantTypeGate() {
  const { selectedOip } = useOip()
  const { memberships } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [status, setStatus] = useState('unknown') // unknown | set | unset | skip
  const [refresh, setRefresh] = useState(0)

  const role = memberships.find(m => m.tenant_id === selectedOip?.tenant_id)?.role
  const canEdit = ['owner', 'admin'].includes(role)

  useEffect(() => {
    const onChange = () => setRefresh(n => n + 1)
    window.addEventListener(TENANT_TYPE_EVENT, onChange)
    return () => window.removeEventListener(TENANT_TYPE_EVENT, onChange)
  }, [])

  useEffect(() => {
    if (!selectedOip?.id) return
    let cancelled = false
    setStatus('unknown')
    loadTenantType(selectedOip.id)
      .then(({ rowId, value }) => {
        if (cancelled) return
        if (!rowId) setStatus('skip')
        else setStatus(value ? 'set' : 'unset')
      })
      .catch(() => { if (!cancelled) setStatus('skip') })
    return () => { cancelled = true }
  }, [selectedOip?.id, refresh])

  const onAllowedPage = ALLOWED_PREFIXES.some(p => location.pathname.startsWith(p))

  useEffect(() => {
    if (status === 'unset' && canEdit && !onAllowedPage) {
      navigate('/profile', { replace: true })
    }
  }, [status, canEdit, onAllowedPage, navigate])

  if (status === 'unset' && !canEdit && !location.pathname.startsWith('/profile')) {
    return (
      <div style={{
        border: '1px solid #f59e0b', background: '#fffbeb', color: '#78350f',
        borderRadius: 6, padding: '10px 14px', margin: '0 0 16px', fontSize: 14,
      }}>
        Your company type isn’t set yet, so Derived Demand scoring may not fit what you sell.
        Ask an owner or admin to set it in <Link to="/profile">Setup → Profile</Link>.
      </div>
    )
  }
  return null
}
