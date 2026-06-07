import { useEffect, useState, Component } from 'react'
import AwardIntel from './components/awards/AwardIntel'
import B2BBusDevTab from './components/awards/B2BBusDevTab'
import PipelineRadar from './components/radar/PipelineRadar'
import MultiVerticalSignalList from './components/signals/MultiVerticalSignalList'
import { useMultiVerticalSignals } from './hooks/useMultiVerticalSignals'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, Link, useParams, Outlet } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { AuthProvider, useAuth } from './lib/auth'
import { OipProvider, useOip } from './lib/oip'
import { validatePassword } from './lib/password'
import { USER_GUIDE, HELP_ANCHORS } from './lib/help'

// ────────────────────────────────────────────────────────────────────────────
// Routing root
// ────────────────────────────────────────────────────────────────────────────

// Isolates a sub-panel: if a child throws during render, show a small fallback
// instead of tearing down the whole view (App.jsx has no other error boundary).
class PanelErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err, info) { console.error('[WinQuest] panel error:', err, info) }
  render() {
    if (this.state.err) {
      return this.props.fallback ?? (
        <div style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
          color: 'var(--ink-fade)', fontStyle: 'italic', padding: '12px 0' }}>
          This panel couldn’t load.
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <OipProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />

            <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<HomePage />} />
              <Route path="weekly" element={<WeeklyUpdatePage />} />
              <Route path="market" element={<MarketReviewPage />} />
              <Route path="market/:entitySlug" element={<MarketEntityPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="objectives" element={<ObjectivesPage />} />
              <Route path="sentinel" element={<SentinelPage />} />
              <Route path="pursued" element={<PursuedPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="settings/team" element={<TeamPage />} />
              <Route path="settings/subscriptions" element={<SubscriptionsPage />} />
              <Route path="settings/runs" element={<RunHistoryPage />} />
              <Route path="settings/integrations" element={<IntegrationsPage />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="help" element={<HelpPage />} />
              <Route path="radar" element={<PipelineRadarPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </OipProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageLoader />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

function FullPageLoader() {
  return (
    <div className="app">
      <div style={{ padding: '120px 0', textAlign: 'center', color: 'var(--ink-fade)', fontFamily: "'IBM Plex Mono', monospace" }}>
        Loading…
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// LAYOUT — shared shell for all authed pages
// ────────────────────────────────────────────────────────────────────────────

function Layout() {
  const { user, signOut } = useAuth()
  const { oips, selectedOip, selectedOipId, selectOip, loading } = useOip()
  const [latestRun, setLatestRun] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  // Demo blur — masks identifying text (company/opportunity/person) for screen-shares.
  const [demoBlur, setDemoBlur] = useState(() => {
    try { return localStorage.getItem('wq-demo-blur') === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('wq-demo-blur', demoBlur ? '1' : '0') } catch {}
  }, [demoBlur])

  // Pull the most recent successful scrape_run for the run-stamp display
  useEffect(() => {
    if (!selectedOip) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('scrape_runs')
        .select('finished_at, state, status, state_groupings:state_grouping_id (name, scrape_cron)')
        .eq('vertical_id', selectedOip.vertical_id)
        .eq('status', 'success')
        .order('finished_at', { ascending: false })
        .limit(1)
      if (cancelled) return
      setLatestRun(data?.[0] ?? null)
    })()
    return () => { cancelled = true }
  }, [selectedOip])

  if (loading) return <FullPageLoader />
  if (oips.length === 0) {
    return (
      <div className="app">
        <Topbar onSignOut={signOut} userEmail={user.email} />
        <div className="empty-state">
          <h2>No OIP available</h2>
          <p style={{ marginTop: 12 }}>
            Your account isn't linked to any OIP yet. Contact your tenant admin to be invited to an OIP.
          </p>
        </div>
      </div>
    )
  }

  // Active section for nav highlight
  const path = location.pathname
  const activeSection =
    path === '/' ? 'home' :
    path.startsWith('/weekly') ? 'weekly' :
    path.startsWith('/market') ? 'market' :
    path.startsWith('/profile') ? 'profile' :
    path.startsWith('/objectives') ? 'objectives' :
    path.startsWith('/sentinel') ? 'sentinel' :
    path.startsWith('/pursued') ? 'pursued' :
    path.startsWith('/radar') ? 'radar' :
    path.startsWith('/settings') ? 'settings' : ''

  return (
    <div className={`app${demoBlur ? ' demo-blur' : ''}`}>
      <Topbar
        onSignOut={signOut}
        userEmail={user.email}
        oips={oips}
        selectedOipId={selectedOipId}
        onSelectOip={selectOip}
        latestRun={latestRun}
      />

      {/* Persistent section nav — visible on every page */}
      <nav className="sec-nav persistent-nav">
        <Link to="/"           className={`sec-nav-btn ${activeSection === 'home' ? 'active' : ''}`}>Dashboard</Link>
        <Link to="/weekly"     className={`sec-nav-btn ${activeSection === 'weekly' ? 'active' : ''}`}>Weekly Update</Link>
        <Link to="/market"     className={`sec-nav-btn ${activeSection === 'market' ? 'active' : ''}`}>Market Review</Link>
        <Link to="/profile"    className={`sec-nav-btn ${activeSection === 'profile' ? 'active' : ''}`}>Profile</Link>
        <Link to="/objectives" className={`sec-nav-btn ${activeSection === 'objectives' ? 'active' : ''}`}>Business Objectives</Link>
        <Link to="/sentinel"   className={`sec-nav-btn ${activeSection === 'sentinel' ? 'active' : ''}`}>Sentinel</Link>
        <Link to="/pursued"    className={`sec-nav-btn ${activeSection === 'pursued' ? 'active' : ''}`}>Pursued</Link>
        {selectedOip?.verticals?.slug === 'sam' && (
          <Link to="/radar" className={`sec-nav-btn ${activeSection === 'radar' ? 'active' : ''}`}>Pipeline Radar</Link>
        )}
        <Link to="/help"       className={`sec-nav-btn ${path.startsWith('/help') ? 'active' : ''}`}>User Guide</Link>
        <button
          type="button"
          onClick={() => setDemoBlur(v => !v)}
          className={`sec-nav-btn ${demoBlur ? 'active' : ''}`}
          title="Blur identifying details (company / opportunity / person) for screen-sharing. Hover any blurred item to reveal."
          style={{ marginLeft: 'auto', border: 'none', background: demoBlur ? undefined : 'none', cursor: 'pointer', font: 'inherit' }}
        >
          {demoBlur ? 'Demo blur: ON' : 'Demo blur'}
        </button>
      </nav>

      {/* Breadcrumb */}
      <nav className="breadcrumb">
        {path === '/' ? (
          <span className="current"><span className="blurable">{selectedOip?.name}</span> dashboard</span>
        ) : (
          <>
            <button onClick={() => navigate('/')}>OIP dashboard</button>
            <span className="sep">/</span>
            <span className="current">{viewLabel(activeSection)}</span>
          </>
        )}
      </nav>

      <Outlet />

      <footer className="confidentiality-footer">
        Confidential — for <span className="blurable">{selectedOip?.tenants?.name || 'tenant'}</span> use only
      </footer>

      <FloatingHelpButton />
    </div>
  )
}

function PipelineRadarPage() {
  const { selectedOipId } = useOip()
  return <PipelineRadar supabase={supabase} oipId={selectedOipId} />
}

function FloatingHelpButton() {
  const [open, setOpen] = useState(false)
  const [prefill, setPrefill] = useState('')

  // Allow any component to open the help modal with a pre-filled message
  // by dispatching: window.dispatchEvent(new CustomEvent('open-help', { detail: { prefill: '...' } }))
  useEffect(() => {
    const handler = (e) => {
      setPrefill(e.detail?.prefill || '')
      setOpen(true)
    }
    window.addEventListener('open-help', handler)
    return () => window.removeEventListener('open-help', handler)
  }, [])

  return (
    <>
      <button onClick={() => { setPrefill(''); setOpen(true) }}
        title="Help & Request"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 50,
          width: 52, height: 52, borderRadius: '50%',
          background: 'var(--primary)', color: 'white',
          border: 'none', cursor: 'pointer',
          fontFamily: "'Spectral', serif", fontSize: 22, fontWeight: 600,
          boxShadow: '0 4px 14px rgba(69,128,248,.35)',
          transition: 'transform .12s, box-shadow .12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}>
        ?
      </button>
      {open && <HelpRequestModal prefill={prefill} onClose={() => setOpen(false)} />}
    </>
  )
}

function HelpRequestModal({ prefill, onClose }) {
  const { user } = useAuth()
  const { selectedOip } = useOip()
  const [message, setMessage] = useState(prefill || '')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState(null)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    if (!message.trim()) { setErr('Please write a message'); return }
    setBusy(true); setErr(null)
    const { data, error } = await supabase.from('support_requests').insert({
      user_id:     user.id,
      user_email:  user.email,
      tenant_id:   selectedOip?.tenant_id || null,
      tenant_name: selectedOip?.tenants?.name || null,
      oip_id:      selectedOip?.id || null,
      oip_name:    selectedOip?.name || null,
      page_url:    window.location.href,
      message:     message.trim(),
    }).select('id').single()
    if (error) { setBusy(false); setErr(error.message); return }
    // Best-effort email — don't block on this
    try {
      await supabase.functions.invoke('support-email', { body: { request_id: data.id } })
    } catch (_) {}
    setBusy(false); setDone(true)
    setTimeout(() => onClose(), 2000)
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--paper)', padding: 32, borderRadius: 4,
        maxWidth: 520, width: '90%',
      }}>
        <div className="detail-eyebrow">Help & Request</div>
        <h2 style={{ fontFamily: "'Spectral', serif", fontSize: 24, marginBottom: 12, fontWeight: 600 }}>
          Send us a message
        </h2>
        {done ? (
          <div>
            <p style={{ fontSize: 15, color: 'var(--ink-light)', lineHeight: 1.55 }}>
              ✓ Sent. We'll reply to <strong>{user.email}</strong>.
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p style={{ fontSize: 14, color: 'var(--ink-fade)', marginBottom: 16, lineHeight: 1.5 }}>
              Question, bug, feature request, or feedback — write whatever's on your mind. We'll see your email,
              what tenant/OIP you're on, and the page you were on when you sent this.
            </p>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              autoFocus
              placeholder="What's going on?"
              rows={6}
              className="form-textarea"
              style={{ marginBottom: 16 }}
            />
            <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 20, fontFamily: "'IBM Plex Mono', monospace" }}>
              Sending as: {user.email}
              {selectedOip && <> · {selectedOip.tenants?.name} · {selectedOip.verticals?.name}</>}
            </div>
            {err && <div className="auth-error">{err}</div>}
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="submit" disabled={busy}
                style={{
                  flex: 1, padding: '10px 18px', background: 'var(--primary)', color: 'white',
                  border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 600,
                }}>
                {busy ? 'Sending…' : 'Send'}
              </button>
              <button type="button" onClick={onClose}
                style={{ padding: '10px 18px', background: 'none', color: 'var(--ink-fade)',
                  border: '1px solid var(--rule-strong)', borderRadius: 3, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--rule)', fontSize: 12, color: 'var(--ink-fade)' }}>
              Looking for documentation? <button type="button" onClick={() => { onClose(); navigate('/help') }}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontFamily: 'inherit', fontSize: 'inherit' }}>
                Open the User Guide
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function viewLabel(section) {
  const map = {
    weekly: 'Weekly Update',
    market: 'Market Review',
    profile: 'Profile',
    objectives: 'Business Objectives',
    sentinel: 'Sentinel',
    pursued: 'Pursued Pipeline',
    radar: 'Pipeline Radar',
    settings: 'Settings',
    help: 'User Guide',
  }
  return map[section] || section
}

// ────────────────────────────────────────────────────────────────────────────
// TOPBAR — brand, OIP switcher, run stamp, user menu
// ────────────────────────────────────────────────────────────────────────────

function Topbar({ onSignOut, userEmail, oips = [], selectedOipId, onSelectOip, latestRun }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()
  const selectedOip = oips.find(o => o.id === selectedOipId)
  const tenantName = selectedOip?.tenants?.name || ''
  const oipName = selectedOip?.name || ''

  const lastRunStr = latestRun?.finished_at
    ? new Date(latestRun.finished_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      })
    : '—'

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-stack">
          <Link to="/" className="brand-mark" style={{ textDecoration: 'none' }}>
            <span className="dot"></span>WinQuest OIP: Opportunity Intelligence Platform
          </Link>
          <div className="brand-customer">
            <span className="blurable">{tenantName}</span>
            {oips.length > 1 ? (
              <select
                value={selectedOipId || ''}
                onChange={e => onSelectOip(e.target.value)}
                style={{
                  marginLeft: 12,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 12,
                  padding: '3px 8px',
                  border: '1px solid var(--rule-strong)',
                  borderRadius: 3,
                  background: 'var(--paper)',
                  color: 'var(--ink-light)',
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {oips.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            ) : (
              oipName ? <span style={{ marginLeft: 8, color: 'var(--ink-fade)' }}>· {oipName}</span> : null
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {latestRun && (
          <div className="run-stamp">
            Last run · {lastRunStr}
          </div>
        )}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{
              border: '1px solid var(--rule-strong)',
              background: 'var(--paper)',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12,
              padding: '6px 12px',
              borderRadius: 3,
              cursor: 'pointer',
              color: 'var(--ink-light)',
            }}
          >
            {userEmail.split('@')[0]} ▾
          </button>
          {menuOpen && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              marginTop: 4,
              background: 'var(--paper)',
              border: '1px solid var(--rule-strong)',
              borderRadius: 3,
              boxShadow: '0 4px 12px rgba(0,0,0,.08)',
              minWidth: 180,
              zIndex: 10,
            }} onMouseLeave={() => setMenuOpen(false)}>
              <MenuItem onClick={() => { setMenuOpen(false); navigate('/account') }}>
                Account & password
              </MenuItem>
              <MenuItem onClick={() => { setMenuOpen(false); navigate('/help') }}>
                User Guide
              </MenuItem>
              <MenuItem onClick={() => { setMenuOpen(false); navigate('/settings') }}>
                Settings
              </MenuItem>
              <MenuItem onClick={() => { setMenuOpen(false); onSignOut() }}>
                Sign out
              </MenuItem>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function MenuItem({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '10px 14px',
        background: 'none',
        border: 'none',
        fontFamily: 'inherit',
        fontSize: 13,
        color: 'var(--ink-light)',
        cursor: 'pointer',
        borderBottom: '1px solid var(--rule)',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {children}
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// AUTH PAGES — Login, Forgot Password, Reset Password, Accept Invite
// ────────────────────────────────────────────────────────────────────────────

function AuthShell({ title, children }) {
  return (
    <div style={{
      maxWidth: 420, margin: '80px auto', padding: '40px 32px',
      background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 4,
      fontFamily: "'IBM Plex Sans', sans-serif",
    }}>
      <div className="brand-mark" style={{ marginBottom: 32, fontSize: 22 }}>
        <span className="dot"></span>WinQuest OIP
      </div>
      <h1 style={{ fontFamily: "'Spectral', serif", fontSize: 28, marginBottom: 24, fontWeight: 600 }}>
        {title}
      </h1>
      {children}
    </div>
  )
}

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (user && !loading) {
      const dest = location.state?.from?.pathname || '/'
      navigate(dest, { replace: true })
    }
  }, [user, loading, navigate, location])

  const handleLogin = async (e) => {
    e.preventDefault()
    setErr(null); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setErr(error.message)
  }

  return (
    <AuthShell title="Sign in">
      <form onSubmit={handleLogin}>
        <AuthField label="Email" type="email" value={email} onChange={setEmail} required />
        <AuthField label="Password" type="password" value={password} onChange={setPassword} required />
        {err && <div className="auth-error">{err}</div>}
        <button type="submit" className="btn-auth-primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div style={{ marginTop: 16, fontSize: 13, textAlign: 'center' }}>
          <Link to="/forgot-password" style={{ color: 'var(--primary)' }}>Forgot password?</Link>
        </div>
      </form>
    </AuthShell>
  )
}

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErr(null); setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setBusy(false)
    if (error) setErr(error.message)
    else setSent(true)
  }

  return (
    <AuthShell title="Reset password">
      {sent ? (
        <div>
          <p style={{ marginBottom: 20, color: 'var(--ink-fade)' }}>
            We sent a magic link to <strong>{email}</strong>. Click it to set a new password.
            The link expires in 1 hour.
          </p>
          <Link to="/login" className="btn-auth-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit}>
          <p style={{ marginBottom: 16, color: 'var(--ink-fade)', fontSize: 14 }}>
            Enter your email. We'll send you a magic link to reset your password.
          </p>
          <AuthField label="Email" type="email" value={email} onChange={setEmail} required />
          {err && <div className="auth-error">{err}</div>}
          <button type="submit" className="btn-auth-primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
          <div style={{ marginTop: 16, fontSize: 13, textAlign: 'center' }}>
            <Link to="/login">Back to sign in</Link>
          </div>
        </form>
      )}
    </AuthShell>
  )
}

function ResetPasswordPage() {
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const validation = validatePassword(pw1)
  const matches = pw1 && pw1 === pw2

  const submit = async (e) => {
    e.preventDefault()
    if (!validation.valid) {
      setErr('Password does not meet requirements')
      return
    }
    if (!matches) {
      setErr('Passwords do not match')
      return
    }
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    setBusy(false)
    if (error) setErr(error.message)
    else { setDone(true); setTimeout(() => navigate('/'), 1500) }
  }

  return (
    <AuthShell title="Set new password">
      {done ? (
        <p>Password updated. Redirecting…</p>
      ) : (
        <form onSubmit={submit}>
          <AuthField label="New password" type="password" value={pw1} onChange={setPw1} required />
          <AuthField label="Confirm password" type="password" value={pw2} onChange={setPw2} required />
          <PasswordRequirements value={pw1} />
          {err && <div className="auth-error">{err}</div>}
          <button type="submit" className="btn-auth-primary" disabled={busy || !validation.valid || !matches}>
            {busy ? 'Updating…' : 'Update password'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}

function AcceptInvitePage() {
  // Magic-link based: Supabase auth will already have authenticated the user
  // when they arrived here from the invite email. We just need them to set a password.
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')

  useEffect(() => {
    // After the page loads with the magic-link tokens, Supabase will set a session.
    // We then claim the invite token (which inserts into tenant_members).
    if (loading || !user || !token) return
    let cancelled = false
    ;(async () => {
      const { error } = await supabase.rpc('claim_tenant_invite', { p_token: token })
      if (cancelled) return
      if (error) setErr('Invite claim failed: ' + error.message)
    })()
    return () => { cancelled = true }
  }, [user, loading, token])

  const validation = validatePassword(pw1)
  const matches = pw1 && pw1 === pw2

  const submit = async (e) => {
    e.preventDefault()
    if (!validation.valid) { setErr('Password does not meet requirements'); return }
    if (!matches) { setErr('Passwords do not match'); return }
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    setBusy(false)
    if (error) setErr(error.message)
    else { setDone(true); setTimeout(() => navigate('/'), 1500) }
  }

  if (loading) return <FullPageLoader />
  if (!user) {
    return (
      <AuthShell title="Invite invalid">
        <p style={{ color: 'var(--ink-fade)' }}>This invite link is missing or expired. Ask your admin to send a new one.</p>
        <Link to="/login" className="btn-auth-primary" style={{ display: 'inline-block', marginTop: 16, textDecoration: 'none' }}>
          Sign in
        </Link>
      </AuthShell>
    )
  }
  return (
    <AuthShell title="Welcome — set your password">
      {done ? (
        <p>Account ready. Redirecting…</p>
      ) : (
        <form onSubmit={submit}>
          <p style={{ marginBottom: 16, color: 'var(--ink-fade)', fontSize: 14 }}>
            Welcome to WinQuest OIP. Choose a password to finish setting up your account.
          </p>
          <AuthField label="Password" type="password" value={pw1} onChange={setPw1} required />
          <AuthField label="Confirm password" type="password" value={pw2} onChange={setPw2} required />
          <PasswordRequirements value={pw1} />
          {err && <div className="auth-error">{err}</div>}
          <button type="submit" className="btn-auth-primary" disabled={busy || !validation.valid || !matches}>
            {busy ? 'Saving…' : 'Set password & continue'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}

function AuthField({ label, type, value, onChange, required }) {
  return (
    <label style={{ display: 'block', marginBottom: 16 }}>
      <div style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '.12em',
        color: 'var(--ink-fade)',
        marginBottom: 6,
      }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        style={{
          width: '100%',
          padding: '10px 12px',
          border: '1px solid var(--rule-strong)',
          borderRadius: 3,
          fontFamily: "'IBM Plex Sans', sans-serif",
          fontSize: 15,
          background: 'var(--paper)',
        }}
      />
    </label>
  )
}

function PasswordRequirements({ value }) {
  const v = validatePassword(value || '')
  const all = [
    { label: '8+ characters',                 ok: !v.errors.includes('At least 8 characters') },
    { label: 'A letter',                      ok: !v.errors.includes('At least one letter') },
    { label: 'A digit',                       ok: !v.errors.includes('At least one digit') },
    { label: 'A special character',           ok: !v.errors.some(e => e.startsWith('At least one special')) },
  ]
  return (
    <div style={{
      fontSize: 12, color: 'var(--ink-fade)', marginBottom: 16,
      fontFamily: "'IBM Plex Mono', monospace",
    }}>
      {all.map(r => (
        <div key={r.label}>
          <span style={{ color: r.ok ? '#0d5e44' : 'var(--ink-faint)', marginRight: 6 }}>
            {r.ok ? '✓' : '○'}
          </span>
          {r.label}
        </div>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// HOME PAGE — hero, status strip, sec-nav, Top 10 entity table
// ────────────────────────────────────────────────────────────────────────────

function HomePage() {
  const { selectedOip } = useOip()
  const [stats, setStats] = useState(null)
  const [top10, setTop10] = useState([])
  const [loading, setLoading] = useState(true)
  const [stateFilter, setStateFilter] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (!selectedOip) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      // Stats from oip_signals
      const { data: tierCounts } = await supabase
        .from('oip_signals')
        .select('signal_tier')
        .eq('oip_id', selectedOip.id)
      const { data: subs } = await supabase
        .from('oip_subscriptions')
        .select('state')
        .eq('oip_id', selectedOip.id)
        .eq('is_active', true)

      // Aggregate top-10 entities (source_name) by tier1_strong then tier1
      const { data: scoredSignals } = await supabase
        .from('oip_signals')
        .select(`
          signal_id, signal_tier, matched_keywords, matched_groups,
          signals:signal_id (id, source_name, state, portal_id, scraped_at)
        `)
        .eq('oip_id', selectedOip.id)

      if (cancelled) return

      const totalActive = tierCounts?.length || 0
      const strongHits = (tierCounts || []).filter(r => r.signal_tier === 'tier1_strong').length
      const states = subs?.length || 0

      // Build entity ranking
      const entityMap = new Map()
      ;(scoredSignals || []).forEach(os => {
        const sig = os.signals
        if (!sig) return
        const entity = sig.source_name || 'Unknown'
        if (!entityMap.has(entity)) {
          entityMap.set(entity, {
            name: entity,
            state: sig.state,
            signals: 0,
            strongHits: 0,
            allKws: new Set(),
            allGroups: new Set(),
            latestAt: sig.scraped_at,
          })
        }
        const e = entityMap.get(entity)
        e.signals++
        if (os.signal_tier === 'tier1_strong') e.strongHits++
        ;(os.matched_keywords || []).forEach(k => e.allKws.add(k))
        ;(os.matched_groups || []).forEach(g => e.allGroups.add(g))
        if (sig.scraped_at > e.latestAt) e.latestAt = sig.scraped_at
      })
      const allEntities = Array.from(entityMap.values()).filter(e => e.signals > 0)
      allEntities.forEach(e => {
        const tier1 = e.signals - e.strongHits
        const strongPts = Math.min(e.strongHits, 5) * 12
        const tier1Pts  = Math.min(tier1, 3) * 8
        const groupPts  = Math.min(e.allGroups.size, 5) * 3
        e.score = Math.min(strongPts + tier1Pts + groupPts, 100)
      })
      const ranked = allEntities.sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map((e, i) => {
          const allKws = Array.from(e.allKws)
          const allGroups = Array.from(e.allGroups)
          return {
            ...e,
            rank: i + 1,
            allKws,
            allGroups,
            quality: e.strongHits >= 3 ? 'strong' : e.signals >= 4 ? 'active' : 'emerging',
            timeline: e.strongHits >= 2 ? 'immediate' : e.signals >= 3 ? 'soon' : 'plan',
            rationale: makeRationale({ ...e, allGroups }),
          }
        })

      const distinctEntities = ranked.length
      setStats({ totalActive, strongHits, states, distinctEntities })
      setTop10(ranked)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [selectedOip])

  // Realtime: subscribe to changes on oip_signals so the dashboard updates live
  useEffect(() => {
    if (!selectedOip) return
    const channel = supabase
      .channel(`oip_signals_${selectedOip.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'oip_signals',
        filter: `oip_id=eq.${selectedOip.id}`,
      }, () => {
        // Bump a refetch by toggling a key — simplest is to re-run the effect above
        // by forcing a state set; cheap approach: refetch counts
        ;(async () => {
          const { data: tierCounts } = await supabase
            .from('oip_signals')
            .select('signal_tier')
            .eq('oip_id', selectedOip.id)
          setStats(prev => prev ? {
            ...prev,
            totalActive: tierCounts?.length || 0,
            strongHits: (tierCounts || []).filter(r => r.signal_tier === 'tier1_strong').length,
          } : prev)
        })()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selectedOip])

  if (loading) return <SectionLoader />
  if (!stats) return null

  const allStates = [...new Set(top10.map(r => r.state))].sort()
  const filtered = top10.filter(r => {
    if (stateFilter && r.state !== stateFilter) return false
    if (tierFilter && r.quality !== tierFilter) return false
    return true
  })

  return (
    <>
      <div className="hero" style={{ marginBottom: 20 }}>
        <div className="hero-eyebrow">
          {selectedOip.tenants?.name} · {selectedOip.verticals?.name}
        </div>
        <h1 className="hero-title" style={{ fontSize: 34 }}>Where to act this week.<HelpIcon topic="home" /></h1>
      </div>

      <div className="status-strip">
        <div className="ss-item">
          <div className="ss-num">{stats.totalActive}</div>
          <div className="ss-label">Active signals · {stats.states} states</div>
        </div>
        <div className="ss-item">
          <div className="ss-num">{stats.strongHits}</div>
          <div className="ss-label">Strong-tier hits</div>
        </div>
        <div className="ss-item">
          <div className="ss-num">{stats.distinctEntities}</div>
          <div className="ss-label">Entities tracked</div>
        </div>
        <div className="ss-item">
          <div className="ss-num">1× / wk</div>
          <div className="ss-label">Run cadence · Sat</div>
        </div>
        <div className="ss-item">
          <div className="ss-num">Sat 2am</div>
          <div className="ss-label">Next scheduled run</div>
        </div>
      </div>

      <div className="top10-header">
        <div className="top10-title">Top {filtered.length < top10.length ? `${filtered.length} of ` : ''}{Math.min(top10.length, 10)} Pursuit Targets</div>
        <div className="top10-controls">
          <select value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
            <option value="">All states</option>
            {allStates.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}>
            <option value="">All signal quality</option>
            <option value="strong">Strong</option>
            <option value="active">Active</option>
            <option value="emerging">Emerging</option>
          </select>
        </div>
      </div>

      <table className="top10-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Entity</th>
            <th>Why it fits</th>
            <th>Signal</th>
            <th>Timeline</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, 10).map(r => <Top10Row key={r.rank} r={r} onView={() => navigate(`/market?entity=${encodeURIComponent(r.name)}`)} />)}
          {filtered.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--ink-faint)' }}>No matches yet — wait for the next scrape cycle.</td></tr>
          )}
        </tbody>
      </table>
    </>
  )
}

// Display-only label for dashboard entities; underlying source_name is unchanged
// (still used as the View-signals filter key).
function entityLabel(name) {
  if (name === 'SAM.gov') return 'B2G'
  if (name === 'USASpending') return 'B2B'
  return name
}

function Top10Row({ r, onView }) {
  const qualityClass = { strong: 'sq-strong', active: 'sq-active', emerging: 'sq-emerging' }[r.quality]
  const qualityLabel = { strong: 'Strong', active: 'Active', emerging: 'Emerging' }[r.quality]
  const timelineClass = { immediate: 'tl-immediate', soon: 'tl-soon', plan: 'tl-plan' }[r.timeline]
  const timelineLabel = { immediate: 'Immediate', soon: 'Soon', plan: 'Put plan in place' }[r.timeline]

  return (
    <tr>
      <td className={`td-rank ${r.rank <= 3 ? 'top3' : ''}`}>{r.rank}</td>
      <td className="td-entity">
        <div className="entity-name">{entityLabel(r.name)}</div>
        <div className="entity-state">{r.state}</div>
      </td>
      <td className="td-rationale">{r.rationale}</td>
      <td className="td-quality">
        <span className={`sq-badge ${qualityClass}`}>
          <span className="sq-dot"></span>{qualityLabel}
        </span>
      </td>
      <td className="td-timeline">
        <span className={`tl-badge ${timelineClass}`}>{timelineLabel}</span>
      </td>
      <td className="td-action">
        <button className="view-link" onClick={onView}
          style={{ border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left', padding: 0 }}>
          View signals →
        </button>
      </td>
    </tr>
  )
}

function makeRationale(e) {
  const groups = e.allGroups
  const groupLabels = {
    civil_infrastructure: 'civil infrastructure',
    broadband_infra: 'broadband',
    broadband_programs: 'broadband programs',
    delivery_methods: 'procurement',
    facilities: 'facilities',
    planning_funding: 'capital planning',
    federal_compliance: 'federal compliance',
    hyperscale_dc: 'hyperscale',
    smart_infra: 'smart infrastructure',
  }
  const labeled = groups.map(g => groupLabels[g] || g).slice(0, 3)
  if (labeled.length === 0) return `${e.signals} active signals`
  if (labeled.length === 1) return `${e.signals} signals across ${labeled[0]}`
  return `${e.signals} signals (${e.strongHits} strong) cross-cutting ${labeled.join(', ')}.`
}

// ────────────────────────────────────────────────────────────────────────────
// WEEKLY UPDATE
// ────────────────────────────────────────────────────────────────────────────

function WeeklyUpdatePage() {
  const { selectedOip } = useOip()
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!selectedOip) return
    let cancelled = false
    ;(async () => {
      // Most recent scrape cycle for this OIP's vertical
      const { data: latest } = await supabase
        .from('scrape_runs')
        .select('scrape_cycle_id, finished_at, state')
        .eq('vertical_id', selectedOip.vertical_id)
        .eq('status', 'success')
        .order('finished_at', { ascending: false })
        .limit(20)
      const cycleId = latest?.[0]?.scrape_cycle_id
      if (!cycleId) { if (!cancelled) setData({ empty: true }); return }

      // Signals from this cycle that scored for this OIP
      const { data: cycleSignals } = await supabase
        .from('oip_signals')
        .select(`
          signal_tier, matched_groups, matched_keywords,
          signals:signal_id!inner (state, source_name, scrape_run_id, title, doc_url)
        `)
        .eq('oip_id', selectedOip.id)

      const cycleRunIds = new Set(latest.filter(r => r.scrape_cycle_id === cycleId).map(r => r.id))
      // Note: we'd need scrape_run_id on signals to filter precisely; if not, we use scraped_at instead.

      const since = latest[0]?.finished_at
      const { data: newSinceRun } = await supabase
        .from('oip_signals')
        .select(`
          signal_tier, matched_keywords, matched_groups, scored_at,
          signals:signal_id (state, source_name, title, doc_url, scraped_at)
        `)
        .eq('oip_id', selectedOip.id)
        .gte('scored_at', new Date(new Date(since).getTime() - 1000 * 60 * 60 * 12).toISOString())
        .order('scored_at', { ascending: false })

      if (cancelled) return

      const total = newSinceRun?.length || 0
      const strong = (newSinceRun || []).filter(r => r.signal_tier === 'tier1_strong')
      const byEntity = new Map()
      ;(newSinceRun || []).forEach(os => {
        const e = os.signals?.source_name
        if (!e) return
        if (!byEntity.has(e)) byEntity.set(e, { name: e, state: os.signals.state, count: 0, strong: 0 })
        byEntity.get(e).count++
        if (os.signal_tier === 'tier1_strong') byEntity.get(e).strong++
      })
      const topEntities = Array.from(byEntity.values()).sort((a, b) => b.strong - a.strong).slice(0, 3)

      setData({
        runDate: since,
        total,
        strong: strong.length,
        topEntities,
        sampleStrong: strong.slice(0, 6),
      })
    })()
    return () => { cancelled = true }
  }, [selectedOip])

  if (!data) return <SectionLoader />
  if (data.empty) {
    return <EmptyMessage title="No runs yet" message="Run results will appear here after the first scrape cycle completes." />
  }
  const dateStr = new Date(data.runDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div className="detail-section">
      <div className="detail-eyebrow">Weekly Update · {dateStr}</div>
      <h2 className="detail-title">Significant signals this week<HelpIcon topic="weekly" /></h2>
      <p className="detail-body">
        Latest run produced <strong>{data.total} scored signals</strong>, with <strong>{data.strong} strong tier-1 multi-keyword matches</strong>.
        Highlight cards below summarize the most significant entities. Subsequent weekly runs will summarize new signals
        since last run, signals closed, entity-level updates, and any flagged activity.
      </p>
      {data.topEntities.length > 0 && (
        <div className="us-grid" style={{ marginTop: 24 }}>
          {data.topEntities.map(e => (
            <div className="us-card" key={e.name}>
              <div className="us-eyebrow">Significant · {e.state}</div>
              <div className="us-title">{e.name}</div>
              <div className="us-body">
                {e.count} signals this run, {e.strong} strong tier hit{e.strong === 1 ? '' : 's'}.
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="action-row" style={{ marginTop: 24 }}>
        <Link to="/market" className="btn-primary-link" style={{ textDecoration: 'none' }}>View full run results →</Link>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// MARKET REVIEW — full signals list with filters and detail drawer
// ────────────────────────────────────────────────────────────────────────────

function MarketReviewPage() {
  const { selectedOip, oips } = useOip()
  const [signals, setSignals] = useState([])
  const [loading, setLoading] = useState(true)
  const [tierFilter, setTierFilter] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [openSignal, setOpenSignal] = useState(null)
  const [openEntity, setOpenEntity] = useState(null)

  // Read entity filter from URL
  const params = new URLSearchParams(useLocation().search)
  const entityFilter = params.get('entity')

  // Multi-vertical: detect if tenant spans more than one vertical
  const uniqueVerticals = [...new Set((oips || []).map(o => o.vertical_id))]
  const isMultiVertical = uniqueVerticals.length > 1

  // Multi-vertical hook — only active when tenant has multiple verticals
  const {
    signals: mvSignals,
    loading: mvLoading,
  } = useMultiVerticalSignals(isMultiVertical ? oips : [], statusFilter)

  useEffect(() => {
    if (!selectedOip) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      let q = supabase
        .from('oip_signals')
        .select(`
          oip_id, signal_id, signal_tier, signal_value, matched_keywords, matched_groups,
          match_reason, text_excerpt, status, notes, scored_at, scores, matched_sentinels,
          signals:signal_id (id, title, source_name, source, state, doc_url, doc_type,
                              meeting_date, scraped_at, full_text_storage_path, portal_id, metadata, signal_kind)
        `)
        .eq('oip_id', selectedOip.id)
        .order('scored_at', { ascending: false })
        .limit(2500)
      if (statusFilter) q = q.eq('status', statusFilter)
      const { data } = await q
      if (cancelled) return
      setSignals(data || [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [selectedOip, statusFilter])

  // Realtime: signals workflow updates
  useEffect(() => {
    if (!selectedOip) return
    const ch = supabase
      .channel(`market_${selectedOip.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oip_signals', filter: `oip_id=eq.${selectedOip.id}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setSignals(prev => prev.map(s => s.signal_id === payload.new.signal_id ? { ...s, ...payload.new } : s))
          } else if (payload.eventType === 'INSERT') {
            // Could add to list, but require refetch for the joined signal data
          }
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selectedOip])

  const allStates = [...new Set(signals.map(s => s.signals?.state).filter(Boolean))].sort()
  const allGroups = [...new Set(signals.flatMap(s => s.matched_groups || []))].sort()

  const updateStatus = async (signalId, newStatus) => {
    const { error } = await supabase
      .from('oip_signals')
      .update({ status: newStatus })
      .eq('oip_id', selectedOip.id)
      .eq('signal_id', signalId)
    if (error) alert('Status update failed: ' + error.message)
  }

  const moveToPursued = async (oipSignal) => {
    const sig = oipSignal.signals
    if (!confirm(`Move "${sig.title}" to your pursued pipeline? It will be excluded from auto-purge.`)) return
    const snapshot = {
      title: sig.title,
      source_name: sig.source_name,
      state: sig.state,
      doc_url: sig.doc_url,
      portal_id: sig.portal_id,
      meeting_date: sig.meeting_date,
      scraped_at: sig.scraped_at,
      matched_keywords: oipSignal.matched_keywords,
      matched_groups: oipSignal.matched_groups,
      signal_tier: oipSignal.signal_tier,
      text_excerpt: oipSignal.text_excerpt,
    }
    const { error } = await supabase.from('pursued_signals').insert({
      oip_id: oipSignal.oip_id,
      signal_id: oipSignal.signal_id,
      snapshot,
      pipeline_stage: 'pursuing',
    })
    if (error) alert('Pursue failed: ' + error.message)
    else updateStatus(oipSignal.signal_id, 'pursuing')
  }

  const isSam = selectedOip?.verticals?.slug === 'sam'
  const isDibOip = selectedOip?.slug === 'sam-dib'
  const [samTab, setSamTab] = useState(isDibOip ? 'dib' : 'opportunities')
  const drawerProps = openSignal ? {
    os: openSignal,
    onClose: () => setOpenSignal(null),
    onUpdateStatus: (status) => { updateStatus(openSignal.signal_id, status); setOpenSignal(prev => ({ ...prev, status })) },
    onPursue: () => { moveToPursued(openSignal); setOpenSignal(null) },
  } : null

  // Split SAM signals into opportunities vs DIB prospects
  const samBusdev        = isSam ? signals.filter(s => s.signals?.signal_kind === 'award') : []
  const samOpportunities = isSam ? signals.filter(s => s.signals?.signal_kind !== 'award' && (s.signals?.metadata?.signal_type || 'opportunity') === 'opportunity') : signals
  const samDib           = isSam ? signals.filter(s => s.signals?.signal_kind !== 'award' && s.signals?.metadata?.signal_type === 'award') : []
  useEffect(() => { setSamTab(isDibOip ? 'dib' : 'opportunities') }, [selectedOip?.id])
  const [naicsFilter, setNaicsFilter] = useState('')
  const activeSignals    = isSam ? (samTab === 'dib' ? samDib : samOpportunities) : signals

  const filtered = activeSignals.filter(s => {
    if (statusFilter && s.status !== statusFilter) return false
    if (tierFilter && s.signal_tier !== tierFilter) return false
    if (!isSam) {
      if (stateFilter && s.signals?.state !== stateFilter) return false
      if (groupFilter && !(s.matched_groups || []).includes(groupFilter)) return false
      if (entityFilter && s.signals?.source_name !== entityFilter) return false
    }
    if (search) {
      const q  = search.toLowerCase()
      const t  = (s.signals?.title || '').toLowerCase()
      const sn = (s.signals?.source_name || s.signals?.metadata?.company_name || '').toLowerCase()
      const dept = (s.signals?.metadata?.department_name || '').toLowerCase()
      if (!t.includes(q) && !sn.includes(q) && !dept.includes(q)) return false
    }
    return true
  })

  return (
    <>
      <div className="hero" style={{ marginBottom: 16 }}>
        <div className="hero-eyebrow">{isSam ? 'SAM.gov' : 'Market Review'}</div>
        <h1 className="hero-title" style={{ fontSize: 30 }}>
          {isSam
            ? (samTab === 'dib' ? 'DIB Prospects' : samTab === 'busdev' ? 'B2B Bus Dev' : 'Opportunities')
            : (entityFilter ? entityFilter : 'Entity Board')}
        </h1>
        {entityFilter && !isSam && (
          <Link to="/market" style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace" }}>
            ← Clear entity filter
          </Link>
        )}
      </div>

      {/* SAM tabs */}
      {isSam && (
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--rule)' }}>
          {[
            { key: 'opportunities', label: 'B2G' },
            { key: 'busdev', label: `B2B${samBusdev.length ? ` (${samBusdev.length})` : ''}` },
            { key: 'dib', label: 'DIB' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setSamTab(tab.key)} style={{
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              borderBottom: samTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -2,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: samTab === tab.key ? 700 : 400,
              color: samTab === tab.key ? 'var(--primary)' : 'var(--ink-fade)',
              fontFamily: "'IBM Plex Mono', monospace",
              textTransform: 'uppercase',
              letterSpacing: '.08em',
            }}>
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Filters bar */}
      <div className="top10-controls" style={{ marginBottom: 20 }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="new">New</option>
          <option value="reviewed">Reviewed</option>
          <option value="pursuing">Pursuing</option>
          <option value="dismissed">Dismissed</option>
          <option value="">All statuses</option>
        </select>
        {isSam ? (
          <input type="search"
            placeholder={samTab === 'dib' ? 'Search company or agency…' : 'Search title or department…'}
            value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 240 }} />

        ) : (
          <>
            <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}>
              <option value="">All tiers</option>
              <option value="tier1_strong">Tier 1 Strong</option>
              <option value="tier1">Tier 1</option>
              <option value="tier2">Tier 2</option>
            </select>
            <select value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
              <option value="">All states</option>
              {allStates.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}>
              <option value="">All groups</option>
              {allGroups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <input type="search" placeholder="Search title/source…" value={search} onChange={e => setSearch(e.target.value)} />
          </>
        )}
      </div>

      {loading ? <SectionLoader /> : (
        <>
          {/* Multi-vertical: unified signal list across all OIPs */}
          {!isSam && isMultiVertical && (
            <MultiVerticalSignalList
              signals={mvSignals}
              loading={mvLoading}
              onSignalClick={setOpenSignal}
            />
          )}

          {/* SLED: Entity Board — single-vertical tenants only */}
          {!isSam && !isMultiVertical && (
            <EntityBoard signals={signals} onEntityClick={name => setOpenEntity(name)} />
          )}
          {/* SAM unchanged */}
          {isSam && (
            samTab === 'busdev' ? (
              <B2BBusDevTab oipId={selectedOip.id} />
            ) : (
            <>
              <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--ink-fade)', fontFamily: "'IBM Plex Mono', monospace" }}>
                {filtered.length} {samTab === 'dib' ? 'prospects' : 'opportunities'}
                {filtered.length !== activeSignals.length && ` of ${activeSignals.length}`}
              </div>
              {filtered.length === 0 ? (
                <EmptyMessage
                  title={samTab === 'dib' && samDib.length === 0 ? 'No DIB prospects yet' : 'No results match your filters'}
                  message={samTab === 'dib' && samDib.length === 0
                    ? 'Enable award notices (ptype=a) in your profile pull config and run a collect.'
                    : 'Adjust filters above or run a new collect.'} />
              ) : samTab === 'dib' ? (
                <DibProspectTable signals={filtered} onRowClick={setOpenSignal} naicsFilter={naicsFilter} setNaicsFilter={setNaicsFilter} />
              ) : (
                <SamOpportunityTable signals={filtered} onRowClick={setOpenSignal} />
              )}
            </>
            )
          )}
        </>
      )}

      {openSignal && <SignalDrawer {...drawerProps} />}
      {openEntity && (
        <EntityDrawer
          entityName={openEntity}
          signals={signals.filter(s => s.signals?.source_name === openEntity)}
          oipId={selectedOip?.id}
          onClose={() => setOpenEntity(null)}
        />
      )}
    </>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// ENTITY BOARD — ranked entity cards for Market Review
// ─────────────────────────────────────────────────────────────────────────────

function EntityBoard({ signals, onEntityClick }) {
  const [search, setSearch] = useState('')

  // Group signals by entity and compute composite score
  const entityMap = new Map()
  for (const s of signals) {
    const name = s.signals?.source_name || 'Unknown'
    const state = s.signals?.state || ''
    if (!entityMap.has(name)) {
      entityMap.set(name, { name, state, strong: 0, tier1: 0, tier2: 0, total: 0, topReason: '' })
    }
    const e = entityMap.get(name)
    e.total++
    if (s.signal_tier === 'tier1_strong') { e.strong++; if (!e.topReason) e.topReason = s.match_reason || '' }
    else if (s.signal_tier === 'tier1')   { e.tier1++;  if (!e.topReason) e.topReason = s.match_reason || '' }
    else                                  { e.tier2++;  if (!e.topReason) e.topReason = s.match_reason || '' }
  }

  // Compute raw scores and normalize
  const entities = Array.from(entityMap.values()).map(e => ({
    ...e,
    rawScore: (e.strong * 3) + (e.tier1 * 1.5) + (e.tier2 * 0.5),
  }))
  const maxScore = Math.max(...entities.map(e => e.rawScore), 1)
  const ranked = entities
    .map(e => ({ ...e, score: Math.round((e.rawScore / maxScore) * 100) }))
    .sort((a, b) => b.score - a.score)

  // Score label + color
  const scoreLabel = (score) => {
    if (score >= 75) return { label: 'Priority',  color: '#16a34a', bg: '#dcfce7' }
    if (score >= 50) return { label: 'Strong',    color: '#2563eb', bg: '#dbeafe' }
    if (score >= 25) return { label: 'Moderate',  color: '#b45309', bg: '#fef3c7' }
    return               { label: 'Watch',     color: '#dc2626', bg: '#fee2e2' }
  }

  const filtered = ranked.filter(e =>
    !search || e.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      {/* Search */}
      <div style={{ marginBottom: 20 }}>
        <input
          type="search"
          placeholder="Search entities…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: 360 }}
        />
      </div>

      <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--ink-fade)',
        fontFamily: "'IBM Plex Mono', monospace" }}>
        {filtered.length} entities · {signals.length} signals
      </div>

      {filtered.map((e, i) => {
        const { label, color, bg } = scoreLabel(e.score)
        return (
          <div key={e.name} style={{
            background: 'var(--paper)',
            border: '2px solid var(--rule)',
            borderRadius: 4,
            padding: '20px 24px',
            marginBottom: 10,
            cursor: 'pointer',
          }}
            onClick={() => onEntityClick && onEntityClick(e.name)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Meta row */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6,
                  fontSize: 13, fontFamily: "'IBM Plex Mono', monospace",
                  color: 'var(--ink-fade)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
                  <span>#{i + 1}</span>
                  <span>·</span>
                  <span>{e.state}</span>
                  <span>·</span>
                  {/* Score badge */}
                  <span style={{ padding: '3px 10px', borderRadius: 3, fontSize: 13,
                    fontWeight: 700, background: bg, color }}>
                    {label} · {e.score}
                  </span>
                  {/* Signal summary */}
                  <span>·</span>
                  <span>
                    {e.strong > 0 && `${e.strong} Strong`}
                    {e.strong > 0 && (e.tier1 > 0 || e.tier2 > 0) && ' · '}
                    {e.tier1 > 0 && `${e.tier1} Tier 1`}
                    {e.tier1 > 0 && e.tier2 > 0 && ' · '}
                    {e.tier2 > 0 && `${e.tier2} Tier 2`}
                  </span>
                </div>
                {/* Entity name */}
                <div style={{ fontFamily: "'Spectral', serif", fontSize: 22, fontWeight: 600,
                  color: 'var(--ink)', lineHeight: 1.3, marginBottom: 6 }}>
                  {e.name}
                </div>
                {/* Teaser */}
                {e.topReason && (
                  <div style={{ fontSize: 15, color: 'var(--ink-light)', lineHeight: 1.6,
                    fontStyle: 'italic', maxWidth: 680 }}>
                    {e.topReason}
                  </div>
                )}
              </div>
              {/* CTA */}
              <div style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace",
                color: 'var(--primary)', fontWeight: 700, whiteSpace: 'nowrap', paddingTop: 4 }}>
                View Briefing →
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// SAM OPPORTUNITY TABLE
// ─────────────────────────────────────────────────────────────────────────────

function SamOpportunityTable({ signals, onRowClick }) {
  const [sortKey, setSortKey] = useState('scores.llm_relevance')
  const [sortDir, setSortDir] = useState('desc')

  const getVal = (s, key) => {
    if (key === 'scores.llm_relevance') return s.scores?.llm_relevance ?? s.scores?.technical_fit ?? -1
    if (key === 'scores.technical_fit') return s.scores?.technical_fit ?? -1
    if (key === 'scores.bid_risk') {
      const order = { Low: 0, Medium: 1, High: 2, 'No Bid': 3 }
      return order[s.scores?.bid_risk] ?? 1
    }
    if (key === 'deadline') {
      const d = s.signals?.metadata?.response_deadline
      return d ? new Date(d).getTime() : Infinity
    }
    if (key === 'modified') {
      const d = s.signals?.metadata?.modified_date
      return d ? new Date(d).getTime() : 0
    }
    if (key === 'title') return (s.signals?.title || '').toLowerCase()
    return 0
  }

  const sorted = [...signals].sort((a, b) => {
    const av = getVal(a, sortKey)
    const bv = getVal(b, sortKey)
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortTh = ({ label, k, style = {} }) => (
    <th onClick={() => toggleSort(k)} style={{
      ...thSam, cursor: 'pointer', userSelect: 'none',
      color: sortKey === k ? 'var(--primary)' : 'var(--ink-fade)',
      ...style,
    }}>
      {label} {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--rule)' }}>
            <SortTh label="Title" k="title" style={{ minWidth: 280, textAlign: 'left' }} />
            <th style={thSam}>Type</th>
            <SortTh label="Due Date" k="deadline" />
            <SortTh label="LLM Score" k="scores.llm_relevance" />
            <SortTh label="Score" k="scores.technical_fit" />
            <SortTh label="Risk" k="scores.bid_risk" />
            <th style={thSam}>Sentinel</th>
            <th style={thSam}>Action</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(s => {
            const sig    = s.signals || {}
            const meta   = sig.metadata || {}
            const scores = s.scores || {}
            const dept   = (meta.department_full || meta.department_name || '').split('.')[0]
            const isUpdated = meta.status_changed

            return (
              <tr key={s.signal_id}
                onClick={() => onRowClick(s)}
                style={{ borderBottom: '1px solid var(--rule)', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-soft)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '12px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    {isUpdated && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: '#fff8e1',
                        color: '#f57f17', border: '1px solid #ffe082', padding: '2px 5px',
                        borderRadius: 3, flexShrink: 0, marginTop: 2 }}>
                        UPDATED
                      </span>
                    )}
                    <div>
                      <div className="blurable" style={{ fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3, marginBottom: 3 }}>
                        {(sig.title || '').length > 60 ? sig.title.slice(0, 60) + '…' : sig.title}
                      </div>
                      <div className="blurable" style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace",
                        color: 'var(--ink-fade)', display: 'flex', gap: 8 }}>
                        {meta.solicitation_number && <span>{meta.solicitation_number.slice(0, 20)}</span>}
                        {dept && <span>{dept.slice(0, 35)}</span>}
                      </div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '12px 8px', whiteSpace: 'nowrap' }}>
                  <NoticeTypePill type={meta.notice_type} />
                </td>
                <td style={{ padding: '12px 8px', fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 12, whiteSpace: 'nowrap', color: scores.days_to_deadline < 30 ? '#c62828' : 'var(--ink)' }}>
                  {meta.response_deadline
                    ? new Date(meta.response_deadline).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' })
                    : '—'}
                </td>

                <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                  <ScoreBadge score={scores.llm_relevance ?? scores.technical_fit} />
                </td>
                <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                  <ScoreBadge score={scores.technical_fit} />
                </td>
                <td style={{ padding: '12px 8px' }}>
                  <RiskBadge risk={scores.bid_risk} />
                </td>

                 <td style={{ padding: '12px 8px' }}>
                  <SentinelNames matched={s.matched_sentinels} />
                </td>
                <td style={{ padding: '12px 8px' }}>
                  <span style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace",
                    color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
                    {scores.llm_recommendation || scores.recommendation || '—'}
                  </span>
                </td>

              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const thSam = {
  padding: '10px 8px',
  fontSize: 12,
  fontFamily: "'IBM Plex Mono', monospace",
  textTransform: 'uppercase',
  letterSpacing: '.08em',
  color: 'var(--ink-fade)',
  textAlign: 'left',
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

function NoticeTypePill({ type }) {
  if (!type) return <span style={{ color: 'var(--ink-fade)', fontSize: 12 }}>—</span>
  const colors = {
    'Solicitation':     { bg: '#e3f2fd', color: '#1565c0' },
    'Presolicitation':  { bg: '#e8f5e9', color: '#2e7d32' },
    'Sources Sought':   { bg: '#fff8e1', color: '#f57f17' },
    'Award Notice':     { bg: '#f3e5f5', color: '#6a1b9a' },
    'Special Notice':   { bg: '#fce4ec', color: '#ad1457' },
    'Justification':    { bg: '#fbe9e7', color: '#bf360c' },
  }
  const s = colors[type] || { bg: 'var(--bg)', color: 'var(--ink-fade)' }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 3,
      background: s.bg, color: s.color, whiteSpace: 'nowrap',
      fontFamily: "'IBM Plex Mono', monospace" }}>
      {type}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DIB PROSPECT TABLE
// ─────────────────────────────────────────────────────────────────────────────

function DibProspectTable({ signals, onRowClick, naicsFilter, setNaicsFilter }) {
  const [sortKey, setSortKey] = useState('award_amount')
  const [sortDir, setSortDir] = useState('desc')

  // Collect unique NAICS codes for filter dropdown
  // Count companies per NAICS
  const naicsCounts = signals.reduce((acc, s) => {
    const n = s.signals?.metadata?.naics_code
    if (n) acc[n] = (acc[n] || 0) + 1
    return acc
  }, {})
  const allNaics = Object.keys(naicsCounts).sort()

  const getVal = (s, key) => {
    if (key === 'scores.icp_fit') return s.scores?.icp_fit ?? s.scores?.technical_fit ?? -1
    // Award amount: parse as float for correct numeric sort
    if (key === 'award_amount') return parseFloat(s.signals?.metadata?.award_amount || 0)
    if (key === 'award_date') {
      const d = s.signals?.metadata?.award_date
      return d ? new Date(d).getTime() : 0
    }
    if (key === 'company') return (s.signals?.metadata?.company_name || s.signals?.title || '').toLowerCase()
    return 0
  }

  const filtered = naicsFilter
    ? signals.filter(s => s.signals?.metadata?.naics_code === naicsFilter)
    : signals

  const sorted = [...filtered].sort((a, b) => {
    const av = getVal(a, sortKey), bv = getVal(b, sortKey)
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortTh = ({ label, k, style = {} }) => (
    <th onClick={() => toggleSort(k)} style={{
      ...thSam, cursor: 'pointer', userSelect: 'none',
      color: sortKey === k ? 'var(--primary)' : 'var(--ink-fade)', ...style,
    }}>
      {label} {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  return (
    <div>
      {/* NAICS filter */}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <select value={naicsFilter} onChange={e => setNaicsFilter(e.target.value)}
          style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, padding: '6px 10px',
            border: '1px solid var(--rule-strong)', borderRadius: 3, background: 'var(--paper)' }}>
          <option value="">All NAICS ({signals.length})</option>
          {allNaics.map(n => <option key={n} value={n}>{n} ({naicsCounts[n]})</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--ink-fade)', fontFamily: "'IBM Plex Mono', monospace" }}>
          {sorted.length} prospects
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--rule)' }}>
              <SortTh label="Company" k="company" style={{ minWidth: 260, textAlign: 'left' }} />
              <th style={thSam}>Agency</th>
              <SortTh label="Award $" k="award_amount" />
              <SortTh label="Award Date" k="award_date" />
              <th style={thSam}>NAICS</th>
              <SortTh label="ICP Fit" k="scores.icp_fit" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => {
              const sig    = s.signals || {}
              const meta   = sig.metadata || {}
              const scores = s.scores || {}
              const company = meta.company_name || sig.title || '—'
              const dept    = (meta.department_full || meta.department_name || '').split('.')[0]
              const amount  = parseFloat(meta.award_amount || 0)

              return (
                <tr key={s.signal_id}
                  onClick={() => onRowClick(s)}
                  style={{ borderBottom: '1px solid var(--rule)', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-soft)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 8px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 3 }}>
                      {company.length > 45 ? company.slice(0, 45) + '…' : company}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--ink-fade)' }}>
                      {meta.uei && <span style={{ marginRight: 8 }}>UEI: {meta.uei}</span>}
                      {meta.company_state && <span>{meta.company_state}</span>}
                    </div>
                  </td>
                  <td style={{ padding: '12px 8px', fontSize: 12, color: 'var(--ink-fade)', maxWidth: 160 }}>
                    {dept.length > 30 ? dept.slice(0, 30) + '…' : dept || '—'}
                  </td>
                  <td style={{ padding: '12px 8px', fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 12, whiteSpace: 'nowrap', fontWeight: 600 }}>
                    {amount > 0 ? `$${amount >= 1e6 ? (amount/1e6).toFixed(1) + 'M' : (amount/1e3).toFixed(0) + 'K'}` : '—'}
                  </td>
                  <td style={{ padding: '12px 8px', fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 12, whiteSpace: 'nowrap', color: 'var(--ink-fade)' }}>
                    {meta.award_date ? new Date(meta.award_date).toLocaleDateString(undefined,
                      { month: 'numeric', day: 'numeric', year: '2-digit' }) : '—'}
                  </td>
                  <td style={{ padding: '12px 8px', fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 12, color: 'var(--ink-fade)' }}>
                    {meta.naics_code || '—'}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                    <ScoreBadge score={scores.icp_fit ?? scores.technical_fit} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}


function RiskBadge({ risk }) {
  if (!risk) return null
  const map = {
    Low:      { bg: '#e8f5e9', color: '#2e7d32', border: '#a5d6a7', label: 'LOW' },
    Medium:   { bg: '#e3f2fd', color: '#1565c0', border: '#90caf9', label: 'MED' },
    High:     { bg: '#fdecea', color: '#c62828', border: '#ef9a9a', label: 'HIGH' },
    'No Bid': { bg: '#f5f5f5', color: '#616161', border: '#bdbdbd', label: 'NO BID' },
  }
  const s = map[risk] || map.Medium
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.05em' }}>
      {s.label}
    </span>
  )
}

function ScoreBadge({ score }) {
  if (score == null) return null
  const color = score >= 60 ? '#2e7d32' : score >= 35 ? '#b45309' : '#c62828'
  const bg    = score >= 60 ? '#e8f5e9' : score >= 35 ? '#fff8e1' : '#fdecea'
  return (
    <span style={{ fontSize: 14, fontWeight: 700, padding: '3px 10px', borderRadius: 3,
      background: bg, color, fontFamily: "'IBM Plex Mono', monospace" }}>
      {score}
    </span>
  )
}
function SentinelNames({ matched }) {
  if (!matched || matched.length === 0)
    return <span style={{ color: 'var(--ink-faint)', fontSize: 11 }}>—</span>
  const names = matched.map(m =>
    typeof m === 'string' ? { name: m, tier: null } :
    typeof m === 'object' && m !== null ? {
      name: m.name || m.sentinel_name || (m.sentinel_id ? m.sentinel_id.slice(0, 8) : null) || '—',
      tier: m.tier || null,
    } : { name: String(m), tier: null }
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {names.map((m, i) => (
        <span key={i} style={{
          fontSize: 11, fontFamily: "'IBM Plex Mono', monospace",
          color: i === 0 ? 'var(--primary-dark)' : 'var(--ink-fade)',
          fontWeight: i === 0 ? 600 : 400,
          whiteSpace: 'nowrap',
        }}>
          {m.name}
          {i === 0 && m.tier === 'tier1_strong' && (
            <span style={{ marginLeft: 4, color: 'var(--primary)', fontSize: 9 }}>●</span>
          )}
        </span>
      ))}
    </div>
  )
}

const SAM_DEPARTMENTS = [
  'DEPT OF AGRICULTURE','DEPT OF THE AIR FORCE','DEPT OF THE ARMY',
  'DEPT OF COMMERCE','DEPT OF DEFENSE','DEPT OF EDUCATION','DEPT OF ENERGY',
  'DEPT OF HEALTH AND HUMAN SERVICES','DEPT OF HOMELAND SECURITY',
  'DEPT OF HOUSING AND URBAN DEVELOPMENT','DEPT OF THE INTERIOR',
  'DEPT OF JUSTICE','DEPT OF LABOR','DEPT OF THE NAVY','DEPT OF STATE',
  'DEPT OF THE TREASURY','DEPT OF TRANSPORTATION','DEPT OF VETERANS AFFAIRS',
  'GENERAL SERVICES ADMINISTRATION',
  'NATIONAL AERONAUTICS AND SPACE ADMINISTRATION',
  'SMALL BUSINESS ADMINISTRATION','SOCIAL SECURITY ADMINISTRATION',
]

function DepartmentPicker({ selected, onChange }) {
  const [open, setOpen] = useState(false)
  const toggle = (dept) => {
    if (selected.includes(dept)) onChange(selected.filter(d => d !== dept))
    else onChange([...selected, dept])
  }
  return (
    <div>
      {selected.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {selected.map(d => (
            <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 3, background: 'var(--primary-soft)', border: '1px solid var(--primary)', fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--primary-dark)', fontWeight: 600 }}>
              {d}
              <button onClick={() => toggle(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <button onClick={() => setOpen(o => !o)} style={{ padding: '8px 12px', border: '1px solid var(--rule-strong)', borderRadius: 3, background: 'var(--paper)', cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'var(--ink-light)', display: 'flex', alignItems: 'center', gap: 8 }}>
        {selected.length === 0 ? 'All departments (no filter)' : `${selected.length} selected`}
        <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 4, border: '1px solid var(--rule-strong)', borderRadius: 3, background: 'var(--paper)', maxHeight: 260, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.08)' }}>
          {SAM_DEPARTMENTS.map(dept => {
            const isSel = selected.includes(dept)
            return (
              <div key={dept} onClick={() => toggle(dept)}
                style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", display: 'flex', alignItems: 'center', gap: 10, background: isSel ? 'var(--primary-soft)' : 'transparent', color: isSel ? 'var(--primary-dark)' : 'var(--ink)', borderBottom: '1px solid var(--rule)' }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--bg)' }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent' }}>
                <span style={{ width: 14, height: 14, borderRadius: 2, flexShrink: 0, border: '1px solid ' + (isSel ? 'var(--primary)' : 'var(--rule-strong)'), background: isSel ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'white' }}>
                  {isSel && '✓'}
                </span>
                {dept}
              </div>
            )
          })}
        </div>
      )}
      {selected.length > 0 && (
        <button onClick={() => onChange([])} style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--ink-fade)', fontFamily: "'IBM Plex Mono', monospace", padding: 0, textDecoration: 'underline' }}>Clear all</button>
      )}
    </div>
  )
}

function SignalCard({ os, onClick }) {
  const sig    = os.signals || {}
  const meta   = sig.metadata || {}
  const scores = os.scores || {}
  const isSam  = !sig.state && sig.source_name === 'SAM.gov'
  const isDib  = isSam && (meta.signal_type === 'award')
  const isOe417Card  = sig.source === 'oe417'
  const isNercCard   = sig.source === 'nerc_ea'
  const isGrantsCard = sig.source === 'grants.gov' || sig.source === 'grants'
  const tierClass = os.signal_tier === 'tier1_strong' ? 'tier-strong' : os.signal_tier === 'tier1' ? 'tier-1' : 'tier-2'

  return (
    <div className="signal-card" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="signal-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="signal-meta" style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 11,
            fontFamily: "'IBM Plex Mono', monospace", color: 'var(--ink-fade)',
            textTransform: 'uppercase', letterSpacing: '.1em', flexWrap: 'wrap', alignItems: 'center' }}>
            {isSam ? (
              <>
                <span>{meta.notice_type || 'SAM.gov'}</span>
                {meta.department_name && <><span>·</span><span>{meta.department_name}</span></>}
                {meta.response_deadline && <><span>·</span><span>Due {new Date(meta.response_deadline).toLocaleDateString()}</span></>}
              </>
            ) : isOe417Card ? (
              <>
                <span>OE-417</span>
                {meta.event_type && <><span>·</span><span>{meta.event_type}</span></>}
                {meta.date_event_began && <><span>·</span><span>{meta.date_event_began}</span></>}
              </>
            ) : isNercCard ? (
              <>
                <span>NERC</span>
                {meta.event_type && <><span>·</span><span>{meta.event_type}</span></>}
                {meta.nerc_region && <><span>·</span><span>{meta.nerc_region}</span></>}
              </>
            ) : isGrantsCard ? (
              <>
                <span>GRANTS.GOV</span>
                {meta.close_date && <><span>·</span><span>Closes {meta.close_date}</span></>}
              </>
            ) : (
              <>
                <span>{sig.state}</span>
                <span>·</span>
                <span>{sig.source_name}</span>
                {sig.meeting_date && <><span>·</span><span>{new Date(sig.meeting_date).toLocaleDateString()}</span></>}
              </>
            )}
            <span className={`tier-pill ${tierClass}`}>{tierLabel(os.signal_tier)}</span>
          </div>
          <div className="signal-title" style={{ fontFamily: "'Spectral', serif", fontSize: 16, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.3 }}>
            {sig.title}
          </div>
          {os.match_reason && (
          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--ink-light)', lineHeight: 1.5, fontStyle: 'italic' }}>
          {os.match_reason}
          </div>
)}
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {isSam && scores.technical_fit != null && <ScoreBadge score={scores.technical_fit} />}
            {isSam && scores.bid_risk && <RiskBadge risk={scores.bid_risk} />}
            {isSam && scores.recommendation && (
              <span style={{ fontSize: 11, color: 'var(--ink-fade)', fontFamily: "'IBM Plex Mono', monospace" }}>
                {scores.recommendation}
              </span>
            )}
            {os.matched_keywords?.slice(0, 4).map(k => (
              <span key={k} className="kw-pill">{k}</span>
            ))}
            {os.matched_keywords?.length > 4 && <span className="kw-pill">+{os.matched_keywords.length - 4}</span>}
          </div>
        </div>
        <div className={`status-pill status-${os.status}`}>{os.status}</div>
      </div>
    </div>
  )
}

function tierLabel(t) {
  return { tier1_strong: 'Strong', tier1: 'Tier 1', tier2: 'Tier 2', no_match: 'Collected' }[t] || t
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTITY DRAWER — right-side panel for entity intelligence
// ─────────────────────────────────────────────────────────────────────────────

function EntityDrawer({ entityName, signals, oipId, onClose }) {
  const [briefing, setBriefing]       = useState(null)
  const [briefingLoading, setBriefingLoading] = useState(true)
  const [contact, setContact]         = useState(null)
  const [contactLoading, setContactLoading] = useState(true)

  // Score
  const strong = signals.filter(s => s.signal_tier === 'tier1_strong').length
  const tier1  = signals.filter(s => s.signal_tier === 'tier1').length
  const groups = [...new Set(signals.flatMap(s => s.matched_groups || []))]
  const score  = Math.min(Math.min(strong,5)*12 + Math.min(tier1,3)*8 + Math.min(groups.length,5)*3, 100)
  const { label, color, bg } = score >= 75 ? { label:'Priority', color:'#16a34a', bg:'#dcfce7' }
    : score >= 50 ? { label:'Strong',   color:'#2563eb', bg:'#dbeafe' }
    : score >= 25 ? { label:'Moderate', color:'#b45309', bg:'#fef3c7' }
    :               { label:'Watch',    color:'#dc2626', bg:'#fee2e2' }

  // Top signals for evidence list (tier1_strong + tier1 only)
  const topSignals = signals
    .filter(s => s.signal_tier === 'tier1_strong' || s.signal_tier === 'tier1' || s.signal_tier === 'tier2')
    .sort((a,b) => {
      const order = { tier1_strong: 0, tier1: 1, tier2: 2 }
      return (order[a.signal_tier] ?? 3) - (order[b.signal_tier] ?? 3)
    })

  // Extract named contacts from signal titles
  // Pattern: "FirstName [Middle] LastName, [Modifier] TitleWord"
  const TITLE_WORDS = ['Superintendent','Director','Principal','CFO','CEO','CIO',
    'Controller','Manager','Clerk','Auditor','President','Commissioner',
    'Administrator','Coordinator','Supervisor','Treasurer','Comptroller',
    'Officer','Chairperson','Chairman','Chairwoman']
  const MODIFIERS = ['Assistant','Deputy','Chief','Senior','Executive','Associate','Acting']

  const titlePattern = new RegExp(
    `([A-Z][a-z]+(?:\\s[A-Z][a-z]+){1,2}),\\s*((?:${MODIFIERS.join('|')})\\s+)?(${TITLE_WORDS.join('|')})`,
    'g'
  )

  const extractedContacts = []
  const seen = new Set()
  signals.forEach(s => {
    const title = s.signals?.title || ''
    let m
    titlePattern.lastIndex = 0
    while ((m = titlePattern.exec(title)) !== null) {
      const name  = m[1].trim()
      const role  = ((m[2]||'') + m[3]).trim()
      const key   = name.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        extractedContacts.push({ name, title: role, source: 'signal_title', contact_mode: 'named' })
      }
    }
  })

  // Contact fetch — only if no named contacts found in titles
  useEffect(() => {
    if (extractedContacts.length > 0) { setContactLoading(false); return }
    const best = signals.find(s => s.signal_tier === 'tier1_strong')
      || signals.find(s => s.signal_tier === 'tier1')
      || signals[0]
    if (!best) { setContactLoading(false); return }
    fetch('https://pcxjkegktlhkvbtmybjk.supabase.co/functions/v1/find-signal-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ signal_id: best.signal_id, oip_id: oipId }),
    })
    .then(r => r.ok ? r.json() : null)
    .then(d => { if (d?.contacts?.length) setContact(d) })
    .catch(() => {})
    .finally(() => setContactLoading(false))
  }, [entityName])

  // Briefing fetch
  useEffect(() => {
    const summaries = signals.slice(0,12).map((s,i) =>
      `${i+1}. [${s.signal_tier}] ${s.signals?.title || ''}\n   ${s.match_reason||''}`
    ).join('\n')
    const prompt = `You are a senior BD analyst. Based on these ${signals.length} procurement signals about ${entityName}, write an intelligence briefing.

SIGNALS:
${summaries}

Write three sections: OPPORTUNITY, CONCERNS, GAPS.
Each section has exactly 3 bullets and one paragraph.
STRICT RULE: Each bullet must be 8 words or fewer. No exceptions.
Format exactly:
OPPORTUNITY:
• [8 words max]
• [8 words max]
• [8 words max]
[paragraph]

CONCERNS:
• [8 words max]
• [8 words max]
• [8 words max]
[paragraph]

GAPS:
• [8 words max]
• [8 words max]
• [8 words max]
[paragraph]

Write for a sales director. Direct, no hedging. No markdown, plain text only.`

    fetch('https://pcxjkegktlhkvbtmybjk.supabase.co/functions/v1/ai-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 900, prompt })
    })
    .then(r => r.json())
    .then(d => setBriefing(d.content?.find(b => b.type==='text')?.text || ''))
    .catch(() => setBriefing('Unable to generate briefing.'))
    .finally(() => setBriefingLoading(false))
  }, [entityName])

  const divider = <hr style={{ border:'none', borderTop:'1px solid var(--rule)', margin:'20px 0' }} />
  const lbl = (txt) => (
    <div style={{ fontSize:11, fontFamily:"'IBM Plex Mono', monospace", fontWeight:700,
      textTransform:'uppercase', letterSpacing:'.12em', color:'var(--ink-fade)', marginBottom:10 }}>
      {txt}
    </div>
  )

  const renderBriefing = (text) => {
    const labels = ['OPPORTUNITY:', 'CONCERNS:', 'GAPS:']
    const labelColors = { 'OPPORTUNITY:': 'var(--primary)', 'CONCERNS:': '#b45309', 'GAPS:': 'var(--ink-fade)' }
    return text.split('\n')
      .map(l => l.replace(/^#+\s*/,'').replace(/\*\*/g,'').trim())
      .filter(Boolean)
      .map((para, i) => {
        const ml = labels.find(l => para.toUpperCase().startsWith(l))
        if (ml) {
          const rest = para.slice(ml.length).trim()
          return (
            <div key={i} style={{ marginTop: i===0?0:24, marginBottom:8 }}>
              <span style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:11, fontWeight:700,
                textTransform:'uppercase', letterSpacing:'.12em', color:labelColors[ml]||'var(--ink-fade)' }}>
                {ml.replace(':','')}
              </span>
              {rest && <span style={{ marginLeft:10, fontSize:14 }}>{rest}</span>}
            </div>
          )
        }
        if (para.startsWith('•') || para.startsWith('-')) {
          return (
            <div key={i} style={{ display:'flex', gap:10, marginBottom:6 }}>
              <span style={{ color:'var(--primary)', flexShrink:0, fontWeight:700 }}>•</span>
              <span style={{ fontSize:14, lineHeight:1.5, color:'var(--ink)', fontWeight:600 }}>
                {para.replace(/^[•\-]\s*/,'')}
              </span>
            </div>
          )
        }
        return (
          <div key={i} style={{ marginTop:8, fontSize:13, color:'var(--ink-light)', lineHeight:1.7 }}>
            {para}
          </div>
        )
      })
  }

  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:100,
      display:'flex', justifyContent:'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background:'var(--paper)', width:'100%', maxWidth:680, height:'100%',
        overflow:'auto', padding:'32px 36px',
      }}>
        <button onClick={onClose} style={{
          background:'none', border:'none', fontSize:20, cursor:'pointer',
          color:'var(--ink-fade)', float:'right', marginRight:-10, marginTop:-10,
        }}>×</button>

        {/* Eyebrow */}
        <div style={{ fontSize:11, fontFamily:"'IBM Plex Mono', monospace", color:'var(--ink-fade)',
          textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8,
          display:'flex', gap:8, alignItems:'center' }}>
          <span>Entity Profile</span>
          <span>·</span>
          <span style={{ padding:'2px 8px', borderRadius:3, fontSize:11, fontWeight:700, background:bg, color }}>
            {label} · {score}
          </span>
          <span>·</span>
          <span>{strong > 0 && `${strong} strong`}{strong>0&&tier1>0&&' · '}{tier1>0&&`${tier1} tier-1`} · {signals.length} total</span>
        </div>

        {/* Entity name */}
        <h2 style={{ fontFamily:"'Spectral', serif", fontSize:24, marginBottom:4,
          lineHeight:1.3, color:'var(--ink)', fontWeight:600 }}>
          {entityName}
        </h2>

        {/* Groups */}
        {groups.length > 0 && (
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:4 }}>
            {groups.map(g => <span key={g} className="kw-pill">{g}</span>)}
          </div>
        )}

        {divider}

        {/* Contact */}
        <div style={{ marginBottom:20 }}>
          {lbl('Contact')}
          {extractedContacts.length > 0 ? (
            extractedContacts.map((c, i) => (
              <div key={i} style={{
                padding:'14px 16px', marginBottom:8,
                background:'var(--primary-soft)',
                borderLeft:'3px solid var(--primary)',
                borderRadius:'0 4px 4px 0',
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ display:'inline-block', width:7, height:7, borderRadius:'50%',
                    background:'var(--primary)' }} />
                  <span style={{ fontSize:10, fontFamily:"'IBM Plex Mono', monospace",
                    textTransform:'uppercase', letterSpacing:'.1em', fontWeight:700,
                    color:'var(--primary)' }}>
                    Named Contact
                  </span>
                </div>
                <div style={{ fontSize:16, fontWeight:600, color:'var(--ink)', marginBottom:2 }}>
                  {c.name}
                </div>
                <div style={{ fontSize:13, color:'var(--ink-fade)' }}>{c.title}</div>
              </div>
            ))
          ) : (
            <>
              {contactLoading && (
                <div style={{ fontSize:13, color:'var(--ink-fade)', fontStyle:'italic',
                  fontFamily:"'IBM Plex Mono', monospace" }}>Finding contact…</div>
              )}
              {!contactLoading && contact?.contacts?.map((c, i) => (
            <div key={i} style={{
              padding:'14px 16px',
              background: c.contact_mode==='named' ? 'var(--primary-soft)' : '#fef9ec',
              borderLeft: `3px solid ${c.contact_mode==='named' ? 'var(--primary)' : '#f0a500'}`,
              borderRadius:'0 4px 4px 0',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                <span style={{ display:'inline-block', width:7, height:7, borderRadius:'50%',
                  background: c.contact_mode==='named' ? 'var(--primary)' : '#f0a500' }} />
                <span style={{ fontSize:10, fontFamily:"'IBM Plex Mono', monospace",
                  textTransform:'uppercase', letterSpacing:'.1em', fontWeight:700,
                  color: c.contact_mode==='named' ? 'var(--primary)' : '#f0a500' }}>
                  {c.contact_mode==='named' ? 'Named Contact' : 'Recommended Role'}
                </span>
              </div>
              <div style={{ fontSize:16, fontWeight:600, color:'var(--ink)', marginBottom:2 }}>
                {c.full_name || c.title || '—'}
              </div>
              {c.full_name && c.title && (
                <div style={{ fontSize:13, color:'var(--ink-fade)', marginBottom:8 }}>{c.title}</div>
              )}
              <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginTop:6 }}>
                {c.email && <a href={`mailto:${c.email}`} style={{ fontSize:13, color:'var(--primary)', textDecoration:'none' }}>✉ {c.email}</a>}
                {c.phone && <a href={`tel:${c.phone}`} style={{ fontSize:13, color:'var(--ink-light)', textDecoration:'none' }}>☎ {c.phone}</a>}
                {c.linkedin_url && <a href={`https://${c.linkedin_url.replace(/^https?:\/\//,'')}`} target="_blank" rel="noopener noreferrer" style={{ fontSize:13, color:'var(--primary)', textDecoration:'none' }}>in LinkedIn →</a>}
                {c.contact_mode==='inferred' && c.raw_data?.buying_window_days && (
                  <span style={{ fontSize:12, color:'var(--ink-fade)', fontFamily:"'IBM Plex Mono', monospace" }}>
                    ~{c.raw_data.buying_window_days} day buying window
                  </span>
                )}
              </div>
              {c.contact_mode==='inferred' && c.raw_data?.key_finding_pattern && (
                <div style={{ marginTop:8, fontSize:12, color:'var(--ink-fade)',
                  fontFamily:"'IBM Plex Mono', monospace" }}>
                  Look for: {c.raw_data.key_finding_pattern}
                </div>
              )}
            </div>
          ))}
              {!contactLoading && !contact && (
                <div style={{ fontSize:13, color:'var(--ink-fade)', fontStyle:'italic',
                  fontFamily:"'IBM Plex Mono', monospace" }}>No contact found.</div>
              )}
            </>
          )}
        </div>

        {divider}

        {/* Intelligence Brief */}
        <div style={{ marginBottom:20 }}>
          {lbl('Intelligence Briefing')}
          {briefingLoading
            ? <div style={{ fontSize:14, color:'var(--ink-fade)', fontStyle:'italic' }}>Generating briefing…</div>
            : <div style={{ fontSize:14, lineHeight:1.8 }}>{renderBriefing(briefing||'')}</div>
          }
        </div>

        {divider}

        {/* Associated Documents — grouped by parent meeting */}
        {(() => {
          // Group signals by parent title (everything before last |)
          const groupMap = new Map()
          topSignals.forEach(s => {
            const title = s.signals?.title || '—'
            const lastPipe = title.lastIndexOf(' | ')
            const hasFile = lastPipe > -1 && title.slice(lastPipe + 3).match(/\.(pdf|docx?|xlsx?)/i)
            const parent = hasFile ? title.slice(0, lastPipe).trim() : title
            const file   = hasFile ? title.slice(lastPipe + 3).trim() : null
            if (!groupMap.has(parent)) {
              groupMap.set(parent, {
                parent,
                tier: s.signal_tier,
                date: s.signals?.meeting_date,
                url: (() => {
                  const raw = s.signals?.doc_url
                  if (!raw) return null
                  if (typeof raw === 'object') return raw.url || null
                  if (typeof raw === 'string') {
                    try { const p = JSON.parse(raw); return p.url || raw } catch { return raw }
                  }
                  return null
                })(),
                source: s.signals?.source,
                keywords: s.matched_keywords || [],
                docs: [],
              })
            }
            const g = groupMap.get(parent)
            if (s.signal_tier === 'tier1_strong') g.tier = 'tier1_strong'
            // Only push as drill-down if it's a named file
            if (file) {
              const rawUrl = s.signals?.doc_url
              const docUrl = (() => {
                if (!rawUrl) return null
                if (typeof rawUrl === 'object') return rawUrl.url || null
                if (typeof rawUrl === 'string') {
                  try { const p = JSON.parse(rawUrl); return p.url || rawUrl } catch { return rawUrl }
                }
                return null
              })()
              g.docs.push({ title: file, url: docUrl, signal_id: s.signal_id })
            }
          })
          const groups = Array.from(groupMap.values())

          return (
            <div style={{ marginBottom:20 }}>
              {lbl(`Associated Documents · ${groups.length} agenda item${groups.length!==1?'s':''} · ${topSignals.length} document${topSignals.length!==1?'s':''}`)}
              {groups.map((g, i) => {
                const tierClass = g.tier === 'tier1_strong' ? 'tier-strong' : 'tier-1'
                return (
                  <div key={i} style={{
                    padding:'14px 0',
                    borderBottom: i < groups.length-1 ? '1px solid var(--rule)' : 'none',
                  }}>
                    {/* Parent meeting title */}
                    <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:8 }}>
                      <span className={`tier-pill ${tierClass}`} style={{ flexShrink:0, marginTop:2 }}>
                        {tierLabel(g.tier)}
                      </span>
                      <div style={{ flex:1 }}>
                        {/* If no drill-down docs, make parent title the link */}
                        {(() => {
                          const validUrl = [g.url, g.source].find(u => u && u.startsWith('http'))
                          return g.docs.length === 0 && validUrl ? (
                            <a href={validUrl} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize:14, fontWeight:600, color:'var(--primary)',
                                textDecoration:'none', lineHeight:1.4, display:'block' }}>
                              {g.parent} →
                            </a>
                          ) : (
                            <div style={{ fontSize:14, fontWeight:600, color:'var(--ink)', lineHeight:1.4 }}>
                              {g.parent}
                            </div>
                          )
                        })()}
                        <div style={{ display:'flex', gap:10, marginTop:4, flexWrap:'wrap', alignItems:'center' }}>
                          {g.date && (
                            <span style={{ fontSize:11, color:'var(--ink-fade)',
                              fontFamily:"'IBM Plex Mono', monospace" }}>
                              {new Date(g.date).toLocaleDateString()}
                            </span>
                          )}
                          {g.keywords.slice(0,3).map(k => (
                            <span key={k} className="kw-pill" style={{ fontSize:10 }}>{k}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {/* Document drill-downs */}
                    {g.docs.length > 0 && (
                      <div style={{ marginLeft:8, paddingLeft:14,
                        borderLeft:'2px solid var(--rule)' }}>
                        {g.docs.map((doc, j) => (
                          <div key={j} style={{
                            padding:'5px 0',
                            borderBottom: j < g.docs.length-1 ? '1px solid var(--rule-faint, #f0f0f0)' : 'none',
                          }}>
                            {doc.url ? (
                              <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{
                                fontSize:12, color:'var(--primary)', textDecoration:'none',
                                display:'flex', alignItems:'center', gap:6,
                              }}>
                                <span style={{ fontSize:10, opacity:0.6 }}>↗</span>
                                {doc.title}
                              </a>
                            ) : (
                              <span style={{ fontSize:12, color:'var(--ink-fade)' }}>{doc.title}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
          {/* end groups */}
            </div>
          )
        })()}
      </div>
    </div>
  )
}


function SignalDrawer({ os, onClose, onUpdateStatus, onPursue }) {
  const sig    = os.signals || {}
  const meta   = sig.metadata || {}
  const scores = os.scores || {}
  const isSam    = !sig.state && sig.source_name === 'SAM.gov'
  const isDib    = isSam && meta.signal_type === 'award'
  const isOe417  = sig.source === 'oe417'  || sig.source_name === 'DOE OE-417'
  const isNerc   = sig.source === 'nerc_ea' || sig.source_name === 'NERC Event Analysis'
  const isGrants = sig.source === 'grants.gov' || sig.source_name === 'Grants.gov'
  const isPuc    = sig.source === 'puc'
  const [aiSummary, setAiSummary] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [enriched, setEnriched] = useState(null)  // on-demand entity data
  const [contactInfo, setContactInfo] = useState(null)
  const [contactLoading, setContactLoading] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(true)
  const [primaryEntity, setPrimaryEntity] = useState(null)

  // Fetch signal_entities on-demand when drawer opens
  useEffect(() => {
    if (!os.signal_id) { setPrimaryEntity(null); return }
    supabase
      .from('signal_entities')
      .select('entity_name, entity_type, entity_state')
      .eq('signal_id', os.signal_id)
      .limit(1)
      .then(({ data }) => setPrimaryEntity(data?.[0] ?? null))
  }, [os.signal_id])

  // On-demand enrichment — fetch company details if not already in metadata
  useEffect(() => {
    if (!isDib) return
    const uei = meta.uei
    if (!uei) return
    // Already enriched — use what we have
    if (meta.entity_enriched_at) {
      setEnriched(meta)
      return
    }
    // Fetch from Supabase Edge Function proxy to avoid CORS + key exposure
    // Falls back gracefully if quota exceeded
    fetch(`https://pcxjkegktlhkvbtmybjk.supabase.co/functions/v1/enrich-entity?uei=${uei}`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }
    })
    .then(r => r.ok ? r.json() : null)
    .then(d => { if (d) setEnriched({ ...meta, ...d }) })
    .catch(() => {})
  }, [os.signal_id])

  // Merge enriched data with meta — enriched takes precedence for entity fields
  const displayMeta = enriched || meta

  const deptDisplay = (() => {
    const full = meta.department_full || ''
    const top  = full.split('.')[0]?.trim() || meta.department_name || ''
    const city = (meta.office_name || '').toUpperCase()
    return city && city !== top ? `${top} · ${city}` : top
  })()

  useEffect(() => {
    if (!isSam) return
    setAiSummary(null)
    // Use pre-scored worker summary if available — skip failing live API call
    if (!isDib && scores.llm_reason) {
      setAiSummary(scores.llm_reason)
      setAiLoading(false)
      return
    }

    setAiLoading(true)

    const prompt = isDib
      ? `You are a B2B sales analyst. Evaluate this DoD contractor as a sales prospect for SMC Infrastructure Solutions (SMCiS), a WOSB/HUBZone-certified telecom infrastructure firm offering structured cabling, fiber optic/OSP construction, in-building wireless (DAS/Small Cell), and managed network services.

Company: ${meta.company_name || sig.title}
Legal Name: ${meta.entity_legal_name || 'Unknown'}
Website: ${meta.entity_website || 'Unknown'}
Agency: ${meta.department_full || meta.department_name || 'Unknown'}
Award Amount: $${meta.award_amount ? (meta.award_amount/1e6).toFixed(1) + 'M' : 'Unknown'}
Award Date: ${meta.award_date || 'Unknown'}
NAICS: ${meta.naics_code || 'Unknown'}
Certifications: ${(meta.entity_certifications || []).join(', ') || 'Unknown'}
ICP Fit: ${scores.icp_fit ?? scores.technical_fit ?? 'N/A'}/100
Engagement Risk: ${scores.engagement_risk || scores.bid_risk || 'Unknown'}

Write 2-4 sentences on why SMCiS should or should not pursue this company as a customer. Cover: alignment with SMCiS services, CMMC/compliance buying trigger, and the best outreach angle. Be direct and actionable.`
      : `You are a federal business development analyst. Evaluate this SAM.gov opportunity for SMC Infrastructure Solutions (SMCiS), a WOSB/HUBZone-certified telecom infrastructure firm specializing in structured cabling, fiber optic/OSP construction, in-building wireless (DAS/Small Cell), and managed network services for federal and DoD clients.

Opportunity:
Title: ${sig.title}
Type: ${meta.notice_type || 'Unknown'}
Department: ${meta.department_full || meta.department_name || 'Unknown'}
NAICS: ${meta.naics_code || 'Unknown'}
Set-Aside: ${meta.set_aside_desc || meta.set_aside_code || 'None specified'}
Due Date: ${meta.response_deadline ? new Date(meta.response_deadline).toLocaleDateString() : 'Unknown'}
Matched Keywords: ${(os.matched_keywords || []).join(', ') || 'None'}
Technical Fit: ${scores.technical_fit ?? 'N/A'}/100
Bid Risk: ${scores.bid_risk || 'Unknown'}
Recommendation: ${scores.recommendation || 'Unknown'}
Evidence: ${(scores.evidence || []).join('; ') || 'None'}

Write 2-4 sentences evaluating whether SMCiS should pursue this. Cover: capability match, set-aside eligibility, and the single most important risk or opportunity. Be direct and actionable — no hedging.`

    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    .then(r => r.json())
    .then(d => setAiSummary(d.content?.find(b => b.type === 'text')?.text || ''))
    .catch(() => setAiSummary('Unable to generate summary.'))
    .finally(() => setAiLoading(false))
  }, [os.signal_id])

  // Contact fetch — SLED signals only (only SLED has a two-letter state code)
  useEffect(() => {
    if (!sig.state || sig.state.length !== 2 || isSam) return
    if (!os.signal_id || !os.oip_id) return
    setContactInfo(null)
    setContactLoading(true)
    fetch('https://pcxjkegktlhkvbtmybjk.supabase.co/functions/v1/find-signal-contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ signal_id: os.signal_id, oip_id: os.oip_id }),
    })
    .then(r => r.ok ? r.json() : null)
    .then(d => { if (d?.contacts?.length) setContactInfo(d) })
    .catch(() => {})
    .finally(() => setContactLoading(false))
  }, [os.signal_id])

  const divider = <hr style={{ border: 'none', borderTop: '1px solid var(--rule)', margin: '20px 0' }} />
  const lbl = (txt) => (
    <div style={{ fontSize: 20, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink)', marginBottom: 14 }}>
      {txt}
    </div>
  )
  const DetailRow = ({ label, value }) => !value ? null : (
    <tr>
      <td style={{ padding: '8px 0', width: 130, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
        color: 'var(--ink-light)', textTransform: 'uppercase', letterSpacing: '.06em', verticalAlign: 'top' }}>
        {label}
      </td>
      <td style={{ padding: '8px 0 8px 16px', fontSize: 17, color: 'var(--ink)' }}>{value}</td>
    </tr>
  )


  const handleDownloadBrief = () => {
    const analysis  = scores.llm_analysis
    const summary   = aiSummary || scores.llm_reason || ''
    const renderSection = (label, section) => {
      if (!section) return ''
      const bs = (section.bullets || []).map(b => `<li style="font-weight:600;margin-bottom:4px">${b}</li>`).join('')
      const p  = section.summary ? `<p style="font-size:13px;line-height:1.75;margin:6px 0 0">${section.summary}</p>` : ''
      return `<div class="lbl">${label}</div><ul style="margin:0 0 8px;padding-left:18px;font-size:13px;line-height:1.6">${bs}</ul>${p}`
    }
    const analysisHtml = analysis
      ? renderSection('Opportunity', analysis.opportunity) + renderSection('Concerns', analysis.concerns) + renderSection('Gaps', analysis.gaps)
      : `<div class="box">${summary || 'No analysis available.'}</div>`
    const deadline  = meta.response_deadline
      ? new Date(meta.response_deadline).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })
      : 'Not specified'
    const scored    = os.scored_at
      ? new Date(os.scored_at).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })
      : new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })
    const llmScore  = os.signal_value ?? '—'
    const rec       = scores.recommendation || '—'
    const recColor  = rec === 'Pursue' ? '#1a5c3a' : rec === 'Consider' ? '#7a4e00' : '#8b1a1a'
    const dept      = (meta.department_full || meta.department_name || '').split('.')[0].trim()
    const keywords  = (os.matched_keywords || []).join(', ') || '—'
    const groups    = (os.matched_groups   || []).join(', ') || '—'
    const setAside  = meta.set_aside_desc || meta.set_aside_code || 'None specified'
    const naics     = meta.naics_code || '—'
    const solNum    = meta.solicitation_number || '—'
    const noticeType = meta.notice_type || '—'

    const w = window.open('', '_blank', 'width=920,height=750')
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>WinQuest Pursuit Brief</title>
<style>
  body{font-family:Georgia,serif;margin:0;padding:48px 64px;color:#1a1a1a;max-width:780px;margin:0 auto}
  .bar{background:#1a3a5c;color:#fff;padding:10px 16px;margin:-48px -64px 32px;font-family:monospace;font-size:12px;display:flex;justify-content:space-between;align-items:center}
  .bar button{background:#fff;color:#1a3a5c;border:none;padding:6px 14px;border-radius:4px;font-weight:700;cursor:pointer;font-size:12px}
  .hdr{border-bottom:3px solid #1a3a5c;padding-bottom:16px;margin-bottom:24px}
  .logo{font-family:monospace;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#1a3a5c;margin-bottom:6px}
  .title{font-size:22px;font-weight:700;line-height:1.3;margin-bottom:8px}
  .meta{font-size:12px;color:#555;font-family:monospace;text-transform:uppercase;letter-spacing:.08em}
  .lbl{font-family:monospace;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.18em;color:#1a3a5c;margin:24px 0 10px}
  .box{background:#f0f4f8;border-left:4px solid #1a3a5c;padding:14px 18px;font-size:14px;line-height:1.8;border-radius:0 4px 4px 0}
  .scores{display:flex;gap:20px;margin-bottom:16px}
  .sc{background:#f8f8f8;border:1px solid #e0e0e0;border-radius:6px;padding:12px 20px;text-align:center;min-width:100px}
  .sc-n{font-size:28px;font-weight:700;color:#1a3a5c;line-height:1}
  .sc-l{font-size:10px;font-family:monospace;text-transform:uppercase;letter-spacing:.1em;color:#777;margin-top:4px}
  .rec-n{font-size:20px;font-weight:700;color:${recColor};line-height:1}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td{padding:7px 0;vertical-align:top;border-bottom:1px solid #f0f0f0}
  td:first-child{width:140px;font-family:monospace;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#777;padding-right:16px}
  .footer{margin-top:40px;padding-top:14px;border-top:1px solid #e0e0e0;font-size:11px;font-family:monospace;color:#aaa;text-transform:uppercase;letter-spacing:.1em;display:flex;justify-content:space-between}
  @media print{.bar{display:none}}
</style></head><body>
<div class="bar"><span>WinQuest Pursuit Brief — Save as PDF</span><button onclick="window.print()">⬇ Save PDF</button></div>
<div class="hdr">
  <div class="logo">WinQuest OIP &middot; Pursuit Brief</div>
  <div class="title">${sig.title || 'Untitled Opportunity'}</div>
  <div class="meta">${noticeType} &middot; ${dept}</div>
</div>
<div class="lbl">WinQuest Analysis</div>
${analysisHtml}
<div class="lbl">Score Summary</div>
<div class="scores">
  <div class="sc"><div class="sc-n">${llmScore}</div><div class="sc-l">Fit Score</div></div>
  <div class="sc"><div class="rec-n">${rec}</div><div class="sc-l">Recommendation</div></div>
</div>
<div class="lbl">Opportunity Detail</div>
<table><tbody>
  <tr><td>Agency</td><td>${dept}</td></tr>
  <tr><td>Notice Type</td><td>${noticeType}</td></tr>
  <tr><td>NAICS</td><td>${naics}</td></tr>
  <tr><td>Set-Aside</td><td>${setAside}</td></tr>
  <tr><td>Response Due</td><td>${deadline}</td></tr>
  <tr><td>Solicitation #</td><td>${solNum}</td></tr>
</tbody></table>
<div class="lbl">Matched Capabilities</div>
<table><tbody>
  <tr><td>Groups</td><td>${groups}</td></tr>
  <tr><td>Keywords</td><td>${keywords}</td></tr>
</tbody></table>
<div class="footer"><span>SMCIS &middot; WinQuest SAM OIP</span><span>Scored ${scored}</span></div>
</body></html>`)
    w.document.close()
  }


  const poc = displayMeta.entity_poc || {}
  const addr = displayMeta.entity_address || {}
  const addrStr = [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', ')

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--paper)', width: '100%', maxWidth: 900, height: '100%',
        overflow: 'auto', padding: '40px 56px',
      }}>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', fontSize: 20, cursor: 'pointer',
          color: 'var(--ink-fade)', float: 'right', marginRight: -10, marginTop: -10,
        }}>×</button>

        {/* Eyebrow */}
        <div style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--ink-light)',
          textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
          {isDib
            ? <>DIB PROSPECT · {meta.department_name?.split('.')[0] || 'Federal'}</>
            : isSam
              ? <>{meta.notice_type || 'SAM.GOV'} · {meta.department_name?.split('.')[0] || 'Federal'}</>
              : isOe417
                ? <>DOE OE-417 · {meta.event_type || 'Grid Disturbance'} · {meta.nerc_region || 'WECC'}</>
                : isNerc
                  ? <>NERC EVENT ANALYSIS · {meta.event_type || 'Reliability Event'}</>
                  : isGrants
                    ? <>GRANTS.GOV · {primaryEntity?.entity_name || meta.agency_name || 'Federal Agency'}</>
                    : isPuc
                      ? <>PUC · {sig.source_name}{sig.meeting_date && ` · ${new Date(sig.meeting_date).toLocaleDateString()}`}</>
                      : <>{sig.source || sig.source_name || sig.state} · {sig.source_name}{sig.meeting_date && ` · ${new Date(sig.meeting_date).toLocaleDateString()}`}</>
          }
        </div>

        {/* Title / Entity */}
        <h2 style={{ fontFamily: "'Spectral', serif", fontSize: 28, marginBottom: 4,
          lineHeight: 1.3, color: 'var(--ink)', fontWeight: 600 }}>
          {isDib
            ? (displayMeta.company_name || displayMeta.entity_legal_name || sig.title || os.text_excerpt?.substring(0, 80))
            : isOe417
              ? (primaryEntity?.entity_name || meta.area_affected || sig.title || os.text_excerpt?.substring(0, 80))
              : isNerc
                ? (primaryEntity?.entity_name || sig.title || os.text_excerpt?.substring(0, 80))
                : isGrants
                  ? (sig.title || os.text_excerpt?.substring(0, 80))
                  : (sig.title || os.text_excerpt?.substring(0, 80) || '(untitled)')}
        </h2>

        {/* OE-417: service area below utility name */}
        {isOe417 && meta.area_affected && meta.area_affected !== primaryEntity?.entity_name && (
          <div style={{ fontSize: 15, color: 'var(--ink-light)', marginBottom: 8, lineHeight: 1.4 }}>
            {meta.area_affected}
          </div>
        )}

        {/* NERC: event title below utility name — only once entity loaded */}
        {isNerc && primaryEntity && sig.title && sig.title !== primaryEntity.entity_name && (
          <div style={{ fontSize: 15, color: 'var(--ink-light)', marginBottom: 8, lineHeight: 1.4 }}>
            {sig.title}
          </div>
        )}

        {/* Grants: agency below opportunity title */}
        {isGrants && (primaryEntity?.entity_name || meta.agency_name) && (
          <div style={{ fontSize: 15, color: 'var(--ink-light)', marginBottom: 8, lineHeight: 1.4 }}>
            {primaryEntity?.entity_name || meta.agency_name}
          </div>
        )}

        {/* OE-417: key stats */}
        {isOe417 && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8, marginTop: 2 }}>
            {meta.demand_loss_mw && (
              <span style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--ink-fade)' }}>
                {meta.demand_loss_mw} MW lost
              </span>
            )}
            {meta.customers_affected && (
              <span style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--ink-fade)' }}>
                · {Number(meta.customers_affected).toLocaleString()} customers
              </span>
            )}
            {meta.date_event_began && (
              <span style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--ink-fade)' }}>
                · {meta.date_event_began}
              </span>
            )}
          </div>
        )}

        {/* NERC: event stats */}
        {isNerc && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8, marginTop: 2 }}>
            {meta.nerc_region && (
              <span style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--ink-fade)' }}>
                {meta.nerc_region}
              </span>
            )}
            {meta.demand_loss_mw && (
              <span style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--ink-fade)' }}>
                · {meta.demand_loss_mw} MW
              </span>
            )}
            {meta.event_date && (
              <span style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--ink-fade)' }}>
                · {meta.event_date}
              </span>
            )}
          </div>
        )}

        {/* Grants: opportunity number and close date */}
        {isGrants && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8, marginTop: 2 }}>
            {meta.opportunity_number && (
              <span style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--ink-fade)' }}>
                #{meta.opportunity_number}
              </span>
            )}
            {meta.close_date && (
              <span style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--ink-fade)' }}>
                · Closes {meta.close_date}
              </span>
            )}
            {meta.opportunity_status && (
              <span style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--ink-fade)' }}>
                · {meta.opportunity_status}
              </span>
            )}
          </div>
        )}

        {/* Solicitation # and Agency — SAM opportunities only */}
        {isSam && !isDib && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8, marginTop: 2 }}>
            {meta.solicitation_number && (
              <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
                color: 'var(--ink-fade)', letterSpacing: '.04em' }}>
                Sol# {meta.solicitation_number}
              </span>
            )}
            {deptDisplay && (
              <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
                color: 'var(--ink-fade)', letterSpacing: '.04em' }}>
                {deptDisplay}
              </span>
            )}
          </div>
        )}

        {/* Why This Signal Matters — immediately below title */}
        {isSam && !isDib && os.match_reason && (
          <div style={{ marginBottom: 16, marginTop: 8 }}>
            <div style={{ fontSize: 20, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink)', marginBottom: 12 }}>
              Why This Signal Matters
            </div>
            <div style={{ fontSize: 17, lineHeight: 1.75, color: 'var(--ink)', fontWeight: 500,
              padding: '16px 20px', background: 'var(--primary-soft)',
              borderLeft: '3px solid var(--primary)', borderRadius: '0 4px 4px 0' }}>
              {os.match_reason}
            </div>
          </div>
        )}

        {isDib && (
          <div style={{ marginBottom: 12 }}>
            {displayMeta.entity_website && (
              <a href={displayMeta.entity_website.startsWith('http') ? displayMeta.entity_website : 'https://' + displayMeta.entity_website}
                target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', marginRight: 16 }}>
                {displayMeta.entity_website} →
              </a>
            )}
            {!meta.entity_enriched_at && !enriched && (
              <span style={{ fontSize: 11, color: 'var(--ink-fade)', fontStyle: 'italic',
                fontFamily: "'IBM Plex Mono', monospace" }}>
                Loading company details…
              </span>
            )}
          </div>
        )}
        {isDib && (
          <div style={{ fontSize: 13, color: 'var(--ink-fade)', marginBottom: 4,
            fontFamily: "'IBM Plex Mono', monospace" }}>
            {sig.title}
          </div>
        )}

        {divider}

        {/* WinQuest Analysis — opportunities only */}
        {isSam && !isDib && (
          <div style={{ marginBottom: 24 }}>
            <div
              onClick={() => setAnalysisOpen(o => !o)}
              style={{ fontSize: 20, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
                color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.08em',
                marginBottom: analysisOpen ? 10 : 0,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                cursor: 'pointer', userSelect: 'none' }}>
              WinQuest Analysis
              <span style={{ fontSize: 14, fontWeight: 400, letterSpacing: 0, opacity: 0.7 }}>
                {analysisOpen ? '▲' : '▼'}
              </span>
            </div>
            {!analysisOpen && (
              <div style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace",
                marginTop: 6, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {scores.recommendation && (
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{scores.recommendation}</span>
                )}
                {scores.technical_fit != null && (
                  <span style={{ color: 'var(--ink-fade)' }}>Fit: {scores.technical_fit}/100</span>
                )}
                {scores.bid_risk && (
                  <span style={{ color: 'var(--ink-fade)' }}>· {scores.bid_risk}</span>
                )}
                <span style={{ color: 'var(--ink-fade)', fontSize: 11 }}>— click to expand</span>
              </div>
            )}
            {analysisOpen && (() => {
              const analysis = scores.llm_analysis
              const sectionLabel = (txt) => (
                <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '.15em', color: 'var(--primary)',
                  marginBottom: 8, marginTop: 16 }}>{txt}</div>
              )
              const bullets = (items) => (
                <ul style={{ margin: '0 0 10px 0', paddingLeft: 18 }}>
                  {(items || []).map((b, i) => (
                    <li key={i} style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 4,
                      fontWeight: 600, color: 'var(--ink)' }}>{b}</li>
                  ))}
                </ul>
              )
              const prose = (txt) => txt
                ? <p style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--ink)', margin: '0 0 4px' }}>{txt}</p>
                : null

              if (analysis?.opportunity || analysis?.concerns || analysis?.gaps) {
                return (
                  <div style={{ padding: '14px 16px', background: 'var(--primary-soft)',
                    borderLeft: '3px solid var(--primary)', borderRadius: '0 4px 4px 0' }}>
                    {sectionLabel('Opportunity')}
                    {bullets(analysis.opportunity?.bullets)}
                    {prose(analysis.opportunity?.summary)}
                    {sectionLabel('Concerns')}
                    {bullets(analysis.concerns?.bullets)}
                    {prose(analysis.concerns?.summary)}
                    {sectionLabel('Gaps')}
                    {bullets(analysis.gaps?.bullets)}
                    {prose(analysis.gaps?.summary)}
                  </div>
                )
              }
              if (aiLoading) return (
                <div style={{ padding: '14px 16px', background: 'var(--primary-soft)',
                  borderLeft: '3px solid var(--primary)', borderRadius: '0 4px 4px 0',
                  fontSize: 14, color: 'var(--ink-fade)', fontStyle: 'italic' }}>
                  Analyzing opportunity…
                </div>
              )
              const fallback = aiSummary || scores.llm_reason
              return (
                <div style={{ padding: '14px 16px', background: 'var(--primary-soft)',
                  borderLeft: '3px solid var(--primary)', borderRadius: '0 4px 4px 0',
                  fontSize: 14, lineHeight: 1.75, color: 'var(--ink)' }}>
                  {fallback || <span style={{ color: 'var(--ink-fade)' }}>—</span>}
                </div>
              )
            })()}
            {analysisOpen && (
              <div style={{ marginTop: 10, textAlign: 'right' }}>
                <button
                  onClick={handleDownloadBrief}
                  style={{
                    background: 'none', border: '1px solid var(--primary)',
                    color: 'var(--primary)', borderRadius: 4, padding: '5px 14px',
                    fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
                    fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  ⬇ Download Brief
                </button>
              </div>
            )}
          </div>
        )}

        {divider}

        {/* ── DIB Company Detail ── */}
        {isDib && <>
          <div style={{ marginBottom: 24 }}>
            {lbl('Company Detail')}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <DetailRow label="Legal Name"  value={displayMeta.entity_legal_name} />
                <DetailRow label="Address"     value={addrStr} />
                <DetailRow label="CAGE Code"   value={displayMeta.entity_cage_code || meta.uei} />
                <DetailRow label="UEI"         value={meta.uei} />
                <DetailRow label="NAICS Codes" value={(displayMeta.entity_naics_codes || []).slice(0,6).join(', ')} />
                <DetailRow label="Certs"       value={(displayMeta.entity_certifications || []).join(', ')} />
                <DetailRow label="Status"      value={displayMeta.entity_status} />
              </tbody>
            </table>
          </div>

          {(poc.name || poc.email || poc.phone || (!meta.entity_enriched_at && !enriched)) && <>
            {divider}
            <div style={{ marginBottom: 24 }}>
              {lbl('Point of Contact')}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <DetailRow label="Name"  value={poc.name} />
                  <DetailRow label="Title" value={poc.title} />
                  <DetailRow label="Email" value={poc.email
                    ? <a href={`mailto:${poc.email}`} style={{ color: 'var(--primary)' }}>{poc.email}</a>
                    : null} />
                  <DetailRow label="Phone" value={poc.phone} />
                </tbody>
              </table>
            </div>
          </>}

          {divider}

          <div style={{ marginBottom: 24 }}>
            {lbl('Award Detail')}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <DetailRow label="Agency"     value={deptDisplay} />
                <DetailRow label="Amount"     value={meta.award_amount ? `$${(meta.award_amount/1e6).toFixed(2)}M` : null} />
                <DetailRow label="Award Date" value={meta.award_date ? new Date(meta.award_date).toLocaleDateString() : null} />
                <DetailRow label="Contract #" value={meta.contract_number || meta.solicitation_number} />
                <DetailRow label="NAICS"      value={meta.naics_code} />
              </tbody>
            </table>
          </div>

          {divider}

          <div style={{ marginBottom: 24 }}>
            {lbl('Company Details')}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <DetailRow label="Name"    value={displayMeta.entity_poc?.name || poc.name} />
                <DetailRow label="Title"   value={displayMeta.entity_poc?.title || poc.title} />
                <DetailRow label="Email"   value={(displayMeta.entity_poc?.email || poc.email)
                  ? <a href={`mailto:${displayMeta.entity_poc?.email || poc.email}`}
                      style={{ color: 'var(--primary)' }}>
                      {displayMeta.entity_poc?.email || poc.email}
                    </a>
                  : null} />
                <DetailRow label="Phone"   value={displayMeta.entity_poc?.phone || poc.phone} />
                <DetailRow label="Website" value={(displayMeta.entity_website)
                  ? <a href={displayMeta.entity_website.startsWith('http') ? displayMeta.entity_website : 'https://' + displayMeta.entity_website}
                      target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>
                      {displayMeta.entity_website}
                    </a>
                  : null} />
                <DetailRow label="Street"  value={displayMeta.entity_address?.street} />
                <DetailRow label="City"    value={displayMeta.entity_address?.city} />
                <DetailRow label="State"   value={displayMeta.entity_address?.state} />
              </tbody>
            </table>
            {!displayMeta.entity_enriched_at && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-fade)',
                fontStyle: 'italic', fontFamily: "'IBM Plex Mono', monospace" }}>
                Contact details will populate on next enrichment run
              </div>
            )}
          </div>
        </>}

        {/* ── Opportunity content (non-DIB SAM) ── */}
        {isSam && !isDib && <>
          <div style={{ marginBottom: 24 }}>
            {lbl('Opportunity Detail')}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <DetailRow label="Type"       value={meta.notice_type} />
                <DetailRow label="Department" value={deptDisplay} />
                <DetailRow label="NAICS"      value={meta.naics_code} />
                <DetailRow label="Set-Aside"  value={meta.set_aside_desc || meta.set_aside_code || 'None'} />
                <DetailRow label="Due Date"   value={meta.response_deadline ? new Date(meta.response_deadline).toLocaleDateString() : null} />
                <DetailRow label="Modified"   value={meta.modified_date ? new Date(meta.modified_date).toLocaleDateString() : null} />
                <DetailRow label="Contract #" value={meta.solicitation_number} />
              </tbody>
            </table>
          </div>

          {divider}

          <div style={{ marginBottom: 24 }}>
            {lbl('Score Breakdown')}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '7px 0', width: 120, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
                    color: 'var(--ink-fade)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Technical Fit</td>
                  <td style={{ padding: '7px 0 7px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ScoreBadge score={scores.technical_fit} />
                      <span style={{ fontSize: 12, color: 'var(--ink-fade)' }}>/ 100</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '7px 0', width: 120, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
                    color: 'var(--ink-fade)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Business Risk</td>
                  <td style={{ padding: '7px 0 7px 16px' }}><RiskBadge risk={scores.bid_risk} /></td>
                </tr>
                <tr>
                  <td style={{ padding: '7px 0', width: 120, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
                    color: 'var(--ink-fade)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Recommendation</td>
                  <td style={{ padding: '7px 0 7px 16px', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                    {scores.recommendation}
                  </td>
                </tr>
              </tbody>
            </table>
            {scores.evidence?.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-light)',
                fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.6 }}>
                {scores.evidence.join(' · ')}
              </div>
            )}
            {scores.bid_risk_notes?.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-fade)',
                fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.6 }}>
                {scores.bid_risk_notes.join(' · ')}
              </div>
            )}
          </div>
        </>}

        {/* Award Intelligence — SAM opportunities only */}
        {isSam && !isDib && (
          <PanelErrorBoundary
            key={os.signal_id}
            fallback={
              <div style={{ marginTop: 8, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
                color: 'var(--ink-fade)', fontStyle: 'italic' }}>
                Award intelligence unavailable for this opportunity.
              </div>
            }
          >
            <AwardIntel
              signalId={os.signal_id}
              oipId={os.oip_id}
              responseDeadline={meta.response_deadline}
              signalTitle={sig.title}
            />
          </PanelErrorBoundary>
        )}

        {/* Contact Section — SLED signals only (have a two-letter state) */}
        {!isSam && sig.state && sig.state.length === 2 && (
          <>
            {divider}
            <div style={{ marginBottom: 20 }}>
              {lbl('Contact')}
              {contactLoading && (
                <div style={{ fontSize: 13, color: 'var(--ink-fade)',
                  fontStyle: 'italic', fontFamily: "'IBM Plex Mono', monospace" }}>
                  Finding contact…
                </div>
              )}
              {!contactLoading && contactInfo?.contacts?.map((c, i) => (
                <div key={i} style={{
                  padding: '14px 16px',
                  background: c.contact_mode === 'named' ? 'var(--primary-soft)' : 'var(--bg-soft, #f8f8f8)',
                  borderLeft: `3px solid ${c.contact_mode === 'named' ? 'var(--primary)' : 'var(--rule-strong)'}`,
                  borderRadius: '0 4px 4px 0',
                  marginBottom: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{
                      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                      background: c.contact_mode === 'named' ? 'var(--primary)' : '#f0a500',
                    }} />
                    <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace",
                      textTransform: 'uppercase', letterSpacing: '.1em',
                      color: c.contact_mode === 'named' ? 'var(--primary)' : '#f0a500', fontWeight: 700 }}>
                      {c.contact_mode === 'named' ? 'Named Contact' : 'Recommended Role'}
                    </span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>
                    {c.full_name || c.title || '—'}
                  </div>
                  {c.full_name && c.title && (
                    <div style={{ fontSize: 13, color: 'var(--ink-fade)', marginBottom: 6 }}>{c.title}</div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                    {c.email && (
                      <a href={`mailto:${c.email}`} style={{
                        fontSize: 13, color: 'var(--primary)', textDecoration: 'none',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <span style={{ fontSize: 11, opacity: 0.7 }}>✉</span> {c.email}
                      </a>
                    )}
                    {c.phone && (
                      <a href={`tel:${c.phone}`} style={{
                        fontSize: 13, color: 'var(--ink-light)', textDecoration: 'none',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <span style={{ fontSize: 11, opacity: 0.7 }}>☎</span> {c.phone}
                      </a>
                    )}
                    {c.linkedin_url && (
                      <a href={`https://${c.linkedin_url.replace(/^https?:\/\//, '')}`}
                        target="_blank" rel="noopener noreferrer" style={{
                        fontSize: 13, color: 'var(--primary)', textDecoration: 'none',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <span style={{ fontSize: 11, opacity: 0.7 }}>in</span> LinkedIn →
                      </a>
                    )}
                  </div>
                  {c.contact_mode === 'inferred' && c.raw_data && (
                    <div style={{ marginTop: 10, paddingTop: 10,
                      borderTop: '1px solid var(--rule)', fontSize: 12,
                      color: 'var(--ink-fade)', fontFamily: "'IBM Plex Mono', monospace",
                      lineHeight: 1.6 }}>
                      {c.raw_data.trigger_type && (
                        <div>Trigger: {c.raw_data.trigger_type.replace(/_/g, ' ')}</div>
                      )}
                      {c.raw_data.buying_window_days && (
                        <div>Buying window: ~{c.raw_data.buying_window_days} days</div>
                      )}
                      {c.raw_data.key_finding_pattern && (
                        <div>Look for: {c.raw_data.key_finding_pattern}</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {!contactLoading && !contactInfo && (
                <div style={{ fontSize: 13, color: 'var(--ink-fade)',
                  fontStyle: 'italic', fontFamily: "'IBM Plex Mono', monospace" }}>
                  No contact found for this signal.
                </div>
              )}
            </div>
          </>
        )}

        {/* Why This Signal Matters moved to top */}

        {/* Signal Categories */}
        {os.matched_keywords?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            {lbl('Signal Categories')}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {os.matched_keywords.map(k => <span key={k} className="kw-pill">{k}</span>)}
            </div>
          </div>
        )}

        {/* SLED excerpt — only for state-partitioned (SLED) signals */}
        {!isSam && sig.state && sig.state.length === 2 && os.text_excerpt && (
          <div style={{ marginBottom: 20 }}>
            {lbl('Excerpt')}
            <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink-light)', whiteSpace: 'pre-wrap' }}>
              {os.text_excerpt}
            </div>
          </div>
        )}

        {/* Source link — consolidated for all verticals */}
        {(() => {
          if (isSam) {
            const url = meta.ui_link || sig.doc_url
            return url ? (
              <div style={{ marginBottom: 20 }}>
                <a href={url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 14, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
                  View on SAM.gov →
                </a>
              </div>
            ) : null
          }
          if (isOe417) {
            const base = 'https://openenergyhub.ornl.gov/explore/dataset/oe-417-annual-summaries/table/'
            const params = new URLSearchParams({ sort: 'date_event_began' })
            if (meta.area_affected) params.append('refine', `area_affected:${meta.area_affected}`)
            if (meta.date_event_began) params.append('refine', `date_event_began:${meta.date_event_began}`)
            return (
              <div style={{ marginBottom: 20 }}>
                <a href={`${base}?${params.toString()}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 14, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
                  View event on Open Energy Hub →
                </a>
              </div>
            )
          }
          if (isNerc) {
            return (
              <div style={{ marginBottom: 20 }}>
                <a href={sig.doc_url || 'https://www.nerc.com/pa/rrm/ea/Pages/default.aspx'}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 14, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
                  View NERC Event Analysis →
                </a>
              </div>
            )
          }
          if (isGrants) {
            const url = sig.doc_url || (meta.opportunity_number ? `https://grants.gov/search-results-detail/${meta.opportunity_number}` : null)
            return url ? (
              <div style={{ marginBottom: 20 }}>
                <a href={url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 14, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
                  View on Grants.gov →
                </a>
              </div>
            ) : null
          }
          if (sig.doc_url) {
            return (
              <div style={{ marginBottom: 20 }}>
                <a href={sig.doc_url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 14, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
                  {isPuc ? 'View PUC document →' : 'View source document →'}
                </a>
              </div>
            )
          }
          return null
        })()}

        {divider}

        {/* Status */}
        <div style={{ marginBottom: 16 }}>
          {lbl('Status')}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['new', 'reviewed', 'pursuing', 'dismissed'].map(s => (
              <button key={s} onClick={() => onUpdateStatus(s)} style={{
                padding: '6px 14px',
                border: '1px solid ' + (os.status === s ? 'var(--primary)' : 'var(--rule-strong)'),
                borderRadius: 3,
                background: os.status === s ? 'var(--primary-soft)' : 'var(--paper)',
                color: os.status === s ? 'var(--primary-dark)' : 'var(--ink-light)',
                cursor: 'pointer',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12, textTransform: 'uppercase', letterSpacing: '.1em',
              }}>{s}</button>
            ))}
          </div>
        </div>

        {/* Pursue */}
        <div style={{ marginBottom: 8 }}>
          <button onClick={onPursue} style={{
            padding: '10px 20px', background: 'var(--primary)', color: 'white',
            border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 14, fontWeight: 600,
          }}>
            Move to pursued pipeline →
          </button>
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-fade)' }}>
            Snapshots this signal so it's preserved if the source is later purged.
          </p>
        </div>

      </div>
    </div>
  )
}

function Block({ label, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '.12em',
        color: 'var(--ink-fade)',
        marginBottom: 10,
      }}>{label}</div>
      {children}
    </div>
  )
}

function MarketEntityPage() {
  // Convenience route: /market/:entitySlug — but we use ?entity=... in MarketReviewPage instead
  return <MarketReviewPage />
}

// ────────────────────────────────────────────────────────────────────────────
// PROFILE — view + edit
// ────────────────────────────────────────────────────────────────────────────

function ProfilePage() {
  const { selectedOip } = useOip()
  const [profile, setProfile] = useState(null)
  const [activeStates, setActiveStates] = useState([])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [versions, setVersions] = useState([])
  const { memberships } = useAuth()
  const myRole = memberships.find(m => m.tenant_id === selectedOip?.tenant_id)?.role
  const canEdit = ['owner', 'admin'].includes(myRole)
  const isSam = selectedOip?.verticals?.slug === 'sam'

  const loadProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, version, is_active, data, created_at')
      .eq('oip_id', selectedOip.id)
      .order('version', { ascending: false })
    if (data) {
      setVersions(data)
      setProfile(data.find(p => p.is_active) || data[0])
    }
    // Also load the current state subscriptions to show "States in Action"
    const { data: subs } = await supabase
      .from('oip_subscriptions')
      .select('state, is_active')
      .eq('oip_id', selectedOip.id)
      .eq('is_active', true)
    setActiveStates((subs || []).map(s => s.state).sort())
  }

  useEffect(() => { if (selectedOip) loadProfile() }, [selectedOip])

  const startEdit = () => {
    setDraft(JSON.parse(JSON.stringify(profile.data)))
    setEditing(true)
  }

  const saveAsNewVersion = async () => {
    setSaving(true)
    const newVersion = (profile.version || 0) + 1
    // Deactivate all profiles for this OIP, then insert+activate the new one
    const { error: deactErr } = await supabase
      .from('profiles')
      .update({ is_active: false })
      .eq('oip_id', selectedOip.id)
    if (deactErr) { alert(deactErr.message); setSaving(false); return }

    const { error: insErr } = await supabase
      .from('profiles')
      .insert({
        oip_id: selectedOip.id,
        version: newVersion,
        is_active: true,
        data: draft,
      })
    setSaving(false)
    if (insErr) { alert(insErr.message); return }
    await loadProfile()
    setEditing(false)
  }

  if (!profile) return <SectionLoader />

  const data = editing ? draft : profile.data

  return (
    <div className="detail-section">
      <div className="detail-eyebrow">Profile · v{profile.version} {profile.is_active ? '(active)' : ''}</div>
      <h2 className="detail-title">
        {data.name || selectedOip.tenants?.name}<HelpIcon topic="profile" />
      </h2>
      {data.description && (
        <p className="detail-body">{editing
          ? <textarea value={draft.description || ''} onChange={e => setDraft({ ...draft, description: e.target.value })} className="form-textarea" rows={3} />
          : data.description}
        </p>
      )}

      {/* States in Action — pulled from active oip_subscriptions */}
      <Block label="States in Action">
        {activeStates.length === 0 ? (
          <div style={{ color: 'var(--ink-fade)', fontSize: 14, marginBottom: 12 }}>
            No states subscribed yet. <Link to="/settings/subscriptions">Add states in Subscriptions</Link>.
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 12,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 14, fontWeight: 600,
            color: 'var(--ink)',
          }}>
            <span style={{
              display: 'inline-block', width: 8, height: 8,
              borderRadius: '50%', background: '#0d5e44',
            }}></span>
            <span>In Action: {activeStates.join(', ')}</span>
          </div>
        )}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-help', {
            detail: {
              prefill: `Hi — I'd like to request a new state subscription for ${selectedOip.tenants?.name} / ${selectedOip.name}.\n\nState: \nReason: `,
            }
          }))}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--primary)', textDecoration: 'underline',
            fontFamily: 'inherit', fontSize: 13, padding: 0,
          }}>
          + Request a new state →
        </button>
      </Block>

      {data.contact && !editing && (
        <Block label="Contact">
          {data.contact.name} · {data.contact.role} · {data.contact.email}
        </Block>
      )}

      {/* ── KEY STRENGTHS ── */}
      <ProfileFieldList label="Key strengths" arr={data.key_strengths || []} editing={editing} onChange={a => setDraft({ ...draft, key_strengths: a })} />

      {/* ── CERTIFICATIONS & STANDARDS ── */}
      <ProfileFieldList
        label="Certifications"
        arr={data.certifications_and_standards?.certifications || []}
        editing={editing}
        onChange={a => setDraft({ ...draft, certifications_and_standards: { ...(draft.certifications_and_standards || {}), certifications: a } })}
      />
      <ProfileFieldList
        label="Government construction standards"
        arr={data.certifications_and_standards?.government_construction_standards || []}
        editing={editing}
        onChange={a => setDraft({ ...draft, certifications_and_standards: { ...(draft.certifications_and_standards || {}), government_construction_standards: a } })}
      />

      {/* ── CORE CAPABILITIES ── */}
      {(data.core_capabilities?.length > 0 || editing) && (
        <Block label="Core capabilities">
          {editing ? (
            <textarea
              value={JSON.stringify(draft.core_capabilities || [], null, 2)}
              onChange={e => { try { setDraft({ ...draft, core_capabilities: JSON.parse(e.target.value) }) } catch (_) {} }}
              className="form-textarea" rows={14}
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {(data.core_capabilities || []).map((cap, i) => (
                <div key={i}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{cap.category}</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {(cap.competencies || []).map((c, j) => (
                      <li key={j} style={{ fontSize: 13, color: 'var(--ink-fade)', marginBottom: 2 }}>{c}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Block>
      )}

      {/* ── IDEAL CUSTOMER PROFILE ── */}
      {(data.ideal_customer_profile || editing) && (
        <Block label="Ideal customer profile">
          {editing ? (
            <textarea
              value={draft.ideal_customer_profile || ''}
              onChange={e => setDraft({ ...draft, ideal_customer_profile: e.target.value })}
              className="form-textarea" rows={3}
            />
          ) : (
            <p style={{ margin: 0, fontSize: 14 }}>{data.ideal_customer_profile}</p>
          )}
        </Block>
      )}

      {/* ── CONTRACT HISTORY ── */}
      <ProfileFieldList label="Contract history" arr={data.contract_history || []} editing={editing} onChange={a => setDraft({ ...draft, contract_history: a })} />

      {/* ── SUCCESSFUL PROJECTS ── */}
      {(data.successful_projects?.length > 0 || editing) && (
        <Block label="Successful projects">
          {editing ? (
            <textarea
              value={JSON.stringify(draft.successful_projects || [], null, 2)}
              onChange={e => { try { setDraft({ ...draft, successful_projects: JSON.parse(e.target.value) }) } catch (_) {} }}
              className="form-textarea" rows={12}
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {(data.successful_projects || []).map((p, i) => (
                <div key={i}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-fade)', lineHeight: 1.5 }}>{p.description}</div>
                </div>
              ))}
            </div>
          )}
        </Block>
      )}

      {/* ── TARGET CONTRACT CHARACTERISTICS ── */}
      {(data.target_contract_characteristics || editing) && (
        <Block label="Target contract characteristics">
          {editing ? (
            <textarea
              value={JSON.stringify(draft.target_contract_characteristics || {}, null, 2)}
              onChange={e => { try { setDraft({ ...draft, target_contract_characteristics: JSON.parse(e.target.value) }) } catch (_) {} }}
              className="form-textarea" rows={10}
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}
            />
          ) : (
            <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.target_contract_characteristics?.preferred_size && (
                <div><strong>Size:</strong> {data.target_contract_characteristics.preferred_size.minimum} – {data.target_contract_characteristics.preferred_size.maximum}</div>
              )}
              {data.target_contract_characteristics?.ideal_duration && (
                <div><strong>Duration:</strong> {data.target_contract_characteristics.ideal_duration.minimum} – {data.target_contract_characteristics.ideal_duration.maximum}</div>
              )}
              {data.target_contract_characteristics?.preferred_contract_types && (
                <div><strong>Types:</strong> {data.target_contract_characteristics.preferred_contract_types.join(', ')}</div>
              )}
              {data.target_contract_characteristics?.preferred_acquisition_strategies && (
                <div><strong>Acquisition:</strong> {data.target_contract_characteristics.preferred_acquisition_strategies.join(', ')}</div>
              )}
            </div>
          )}
        </Block>
      )}

      {/* ── VALUE CAPTURE METHODOLOGY ── */}
      {(data.value_capture_methodology || editing) && (
        <Block label="Value capture methodology">
          {editing ? (
            <textarea
              value={JSON.stringify(draft.value_capture_methodology || {}, null, 2)}
              onChange={e => { try { setDraft({ ...draft, value_capture_methodology: JSON.parse(e.target.value) }) } catch (_) {} }}
              className="form-textarea" rows={10}
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}
            />
          ) : (
            <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.value_capture_methodology?.overview && <div>{data.value_capture_methodology.overview}</div>}
              {data.value_capture_methodology?.decision_framework && (
                <div><strong>Decision:</strong> {data.value_capture_methodology.decision_framework}</div>
              )}
              {data.value_capture_methodology?.value_extraction_guidance && (
                <div style={{ color: 'var(--ink-fade)', lineHeight: 1.5 }}>{data.value_capture_methodology.value_extraction_guidance}</div>
              )}
            </div>
          )}
        </Block>
      )}

      {/* ── COMPANY METRICS ── */}
      {(data.company_metrics || editing) && (
        <Block label="Company metrics">
          {editing ? (
            <textarea
              value={JSON.stringify(draft.company_metrics || {}, null, 2)}
              onChange={e => { try { setDraft({ ...draft, company_metrics: JSON.parse(e.target.value) }) } catch (_) {} }}
              className="form-textarea" rows={12}
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}
            />
          ) : (
            <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {Object.entries(data.company_metrics || {}).map(([k, v]) =>
                typeof v !== 'object' ? (
                  <div key={k}><strong>{k.replace(/_/g, ' ')}:</strong> {String(v)}</div>
                ) : null
              )}
              {data.company_metrics?.clearance_capabilities && (
                <div><strong>clearances:</strong> {Object.entries(data.company_metrics.clearance_capabilities).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>
              )}
            </div>
          )}
        </Block>
      )}

      {/* ── SOCIOECONOMIC STATUS ── */}
      <ProfileFieldList
        label="Socioeconomic certifications"
        arr={
          Array.isArray(data.socioeconomic_status)
            ? data.socioeconomic_status
            : (data.socioeconomic_status?.current_certifications || [])
        }
        editing={editing}
        onChange={a => setDraft({
          ...draft,
          socioeconomic_status: typeof draft.socioeconomic_status === 'object' && !Array.isArray(draft.socioeconomic_status)
            ? { ...draft.socioeconomic_status, current_certifications: a }
            : a,
        })}
      />
      {!editing && data.socioeconomic_status?.possible_entries_reference?.length > 0 && (
        <Block label="Socioeconomic possible entries (reference)">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {data.socioeconomic_status.possible_entries_reference.map((e, i) => (
              <li key={i} style={{ fontSize: 13, color: 'var(--ink-fade)', marginBottom: 2 }}>{e}</li>
            ))}
          </ul>
        </Block>
      )}

      {/* ── LEGACY FIELDS (v9 and earlier — render only if populated) ── */}
      <ProfileFieldList label="Focus areas" arr={data.focus_areas || []} editing={editing} onChange={a => setDraft({ ...draft, focus_areas: a })} />
      <ProfileFieldList label="Service capabilities" arr={data.service_capabilities || []} editing={editing} onChange={a => setDraft({ ...draft, service_capabilities: a })} />
      <ProfileFieldList label="Key funding programs" arr={data.key_funding_programs || []} editing={editing} onChange={a => setDraft({ ...draft, key_funding_programs: a })} />
      {isSam && (
        <ProfileFieldList
          label="Target Customer Profile"
          arr={data.target_customer || []}
          editing={editing}
          onChange={a => setDraft({ ...draft, target_customer: a })}
        />
      )}

      {/* Minimum deadline days — SAM only, configured in Sentinel */}
      {isSam && (
        <Block label="Minimum deadline (days)">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14 }}>
              {data.pull?.min_deadline_days ?? 30} days
            </span>
            <span style={{ fontSize: 12, color: 'var(--ink-fade)' }}>
              Configured in{' '}
              <Link to="/sentinel" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                Sentinel → Collection Config
              </Link>
            </span>
          </div>
        </Block>
      )}

      {canEdit && (
        <div className="action-row" style={{ marginTop: 32 }}>
          {!editing ? (
            <>
              <button onClick={startEdit} className="btn-primary-link" style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                Edit profile →
              </button>
              {versions.length > 1 && (
                <span style={{ marginLeft: 16, fontSize: 13, color: 'var(--ink-fade)' }}>
                  {versions.length} versions
                </span>
              )}
            </>
          ) : (
            <>
              <button onClick={saveAsNewVersion} disabled={saving}
                style={{ padding: '10px 18px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 600 }}>
                {saving ? 'Saving…' : 'Save as new version'}
              </button>
              <button onClick={() => setEditing(false)}
                style={{ marginLeft: 12, padding: '10px 18px', background: 'none', color: 'var(--ink-fade)', border: '1px solid var(--rule-strong)', borderRadius: 3, cursor: 'pointer' }}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}


function ProfileFieldList({ label, arr, editing, onChange }) {
  if (!editing && (!arr || arr.length === 0)) return null
  // If editing AND any item is non-string, fall back to JSON edit instead of line editor
  const hasObjectItems = (arr || []).some(x => typeof x !== 'string')
  return (
    <Block label={label}>
      {editing ? (
        hasObjectItems ? (
          <textarea
            className="form-textarea"
            rows={10}
            value={JSON.stringify(arr || [], null, 2)}
            onChange={e => {
              try {
                const parsed = JSON.parse(e.target.value)
                if (Array.isArray(parsed)) onChange(parsed)
              } catch (_) { /* ignore until valid */ }
            }}
            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}
          />
        ) : (
          <textarea
            className="form-textarea"
            rows={6}
            value={(arr || []).join('\n')}
            onChange={e => onChange(e.target.value.split('\n').map(l => l.trim()).filter(Boolean))}
            placeholder="One item per line"
          />
        )
      ) : (
        hasObjectItems ? (
          <RichValue value={arr} />
        ) : (
          <ul style={{ paddingLeft: 22, lineHeight: 1.7, fontSize: 14, color: 'var(--ink-light)' }}>
            {arr.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        )
      )}
    </Block>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// OBJECTIVES — slice of profile
// ────────────────────────────────────────────────────────────────────────────

function ObjectivesPage() {
  const { selectedOip } = useOip()
  const [profile, setProfile] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const { memberships } = useAuth()
  const myRole = memberships.find(m => m.tenant_id === selectedOip?.tenant_id)?.role
  const canEdit = ['owner', 'admin'].includes(myRole)

  const load = async () => {
    if (!selectedOip) return
    const { data } = await supabase
      .from('profiles')
      .select('id, version, data')
      .eq('oip_id', selectedOip.id)
      .eq('is_active', true)
      .single()
    setProfile(data)
  }

  useEffect(() => { load() }, [selectedOip])

  const startEdit = () => {
    setDraft({
      strategic_targets:       profile.data.strategic_targets       ?? [],
      expansion_opportunities: profile.data.expansion_opportunities ?? [],
      evaluation_criteria:     profile.data.evaluation_criteria     ?? [],
    })
    setErr(null)
    setEditing(true)
  }

  const saveAsNewVersion = async () => {
    setSaving(true)
    setErr(null)
    const newVersion = (profile.version || 0) + 1
    const newData = {
      ...profile.data,
      strategic_targets:       draft.strategic_targets,
      expansion_opportunities: draft.expansion_opportunities,
      evaluation_criteria:     draft.evaluation_criteria,
    }
    await supabase.from('profiles').update({ is_active: false }).eq('oip_id', selectedOip.id)
    const { error } = await supabase.from('profiles').insert({
      oip_id: selectedOip.id,
      version: newVersion,
      is_active: true,
      data: newData,
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    await load()
    setEditing(false)
  }

  if (!profile) return <SectionLoader />
  const d = profile.data

  return (
    <div className="detail-section">
      <div className="detail-eyebrow">Business Objectives · v{profile.version}</div>
      <h2 className="detail-title">Strategic targets and expansion areas<HelpIcon topic="objectives" /></h2>

      <ObjectivesField
        label="Strategic targets"
        value={editing ? draft.strategic_targets : d.strategic_targets}
        editing={editing}
        onChange={v => setDraft({ ...draft, strategic_targets: v })}
      />
      <ObjectivesField
        label="Expansion opportunities"
        value={editing ? draft.expansion_opportunities : d.expansion_opportunities}
        editing={editing}
        onChange={v => setDraft({ ...draft, expansion_opportunities: v })}
      />
      <ObjectivesField
        label="Evaluation criteria"
        value={editing ? draft.evaluation_criteria : d.evaluation_criteria}
        editing={editing}
        onChange={v => setDraft({ ...draft, evaluation_criteria: v })}
      />

      {err && <div className="auth-error" style={{ marginTop: 12 }}>{err}</div>}

      {canEdit && (
        <div className="action-row" style={{ marginTop: 24, display: 'flex', gap: 12 }}>
          {!editing ? (
            <button onClick={startEdit} className="btn-primary-link"
              style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              Edit objectives →
            </button>
          ) : (
            <>
              <button onClick={saveAsNewVersion} disabled={saving}
                style={{ padding: '10px 18px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 600 }}>
                {saving ? 'Saving…' : 'Save as new version'}
              </button>
              <button onClick={() => setEditing(false)}
                style={{ padding: '10px 18px', background: 'none', color: 'var(--ink-fade)', border: '1px solid var(--rule-strong)', borderRadius: 3, cursor: 'pointer' }}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ObjectivesField — handles three shapes uniformly:
//   - undefined / null → editable as nothing (placeholder)
//   - array of strings → one-per-line textarea (read: bullet list)
//   - object with arbitrary keys (incl. nested arrays) → one textarea per key,
//     where each value may itself be string/number, array of strings, or object.
//   - array of objects → renders as cards in read mode, JSON in edit mode
//     (less common in practice).
function ObjectivesField({ label, value, editing, onChange }) {
  // In read mode, just delegate to RichValue
  if (!editing) {
    if (value === null || value === undefined ||
        (Array.isArray(value) && value.length === 0)) {
      return null
    }
    return (
      <Block label={label}>
        <RichValue value={value} />
      </Block>
    )
  }

  // In edit mode, branch by shape
  // Object → one labeled textarea per key
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return (
      <Block label={label}>
        <p style={{ fontSize: 13, color: 'var(--ink-fade)', marginBottom: 12, fontStyle: 'italic' }}>
          Each section is edited separately below. Lists use one item per line.
        </p>
        {Object.entries(value).map(([k, v]) => (
          <div key={k} style={{ marginBottom: 16 }}>
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '.1em',
              color: 'var(--ink-fade)', marginBottom: 6,
            }}>{humanizeKey(k)}</div>
            {Array.isArray(v) && v.every(x => typeof x === 'string') ? (
              <textarea
                className="form-textarea"
                rows={Math.max(3, v.length + 1)}
                value={v.join('\n')}
                onChange={e => onChange({
                  ...value,
                  [k]: e.target.value.split('\n').map(l => l.trim()).filter(Boolean),
                })}
                placeholder="One item per line"
              />
            ) : typeof v === 'string' ? (
              <textarea
                className="form-textarea"
                rows={Math.max(2, Math.ceil(v.length / 80))}
                value={v}
                onChange={e => onChange({ ...value, [k]: e.target.value })}
              />
            ) : (
              // Mixed shape — fall back to JSON for this key only
              <textarea
                className="form-textarea"
                rows={6}
                value={JSON.stringify(v, null, 2)}
                onChange={e => {
                  try {
                    const parsed = JSON.parse(e.target.value)
                    onChange({ ...value, [k]: parsed })
                  } catch (_) { /* keep as-is until valid */ }
                }}
                style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}
              />
            )}
          </div>
        ))}
      </Block>
    )
  }

  // Array of strings → one textarea, one per line
  if (Array.isArray(value) && value.every(x => typeof x === 'string')) {
    return (
      <Block label={label}>
        <textarea
          className="form-textarea"
          rows={Math.max(4, value.length + 1)}
          value={value.join('\n')}
          onChange={e => onChange(e.target.value.split('\n').map(l => l.trim()).filter(Boolean))}
          placeholder="One item per line"
        />
      </Block>
    )
  }

  // Array of objects, or empty/null — JSON editor
  return (
    <Block label={label}>
      <p style={{ fontSize: 13, color: 'var(--ink-fade)', marginBottom: 8, fontStyle: 'italic' }}>
        Structured data — edit as JSON.
      </p>
      <textarea
        className="form-textarea"
        rows={10}
        value={JSON.stringify(value ?? [], null, 2)}
        onChange={e => {
          try { onChange(JSON.parse(e.target.value)) } catch (_) {}
        }}
        style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}
      />
    </Block>
  )
}

// =====================================================================
// RichValue — recursive renderer for JSON-shaped profile/objective fields.
// Handles three common shapes:
//   - list of strings → bullet list
//   - list of objects → each rendered as a small card with key/value rows
//   - object with arbitrary keys → key/value rows where values may recurse
// "notes" key gets rendered as italic prose at the top.
// =====================================================================

function RichValue({ value, depth = 0 }) {
  if (value === null || value === undefined) return null

  // Primitive
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <span>{String(value)}</span>
  }

  // Array
  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: 'var(--ink-faint)' }}>(empty)</span>
    // Array of primitives → bullet list
    if (value.every(v => typeof v === 'string' || typeof v === 'number')) {
      return (
        <ul style={{ paddingLeft: 22, lineHeight: 1.7, fontSize: 14, color: 'var(--ink-light)' }}>
          {value.map((v, i) => <li key={i}>{String(v)}</li>)}
        </ul>
      )
    }
    // Array of objects → cards
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {value.map((item, i) => (
          <div key={i} style={{
            padding: '12px 14px',
            background: 'var(--bg)',
            border: '1px solid var(--rule)',
            borderRadius: 3,
          }}>
            <RichValue value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    )
  }

  // Object — render as key/value rows
  if (typeof value === 'object') {
    const entries = Object.entries(value)
    // Pull out "notes" first to display as prose at top
    const notes = entries.find(([k]) => k === 'notes' || k === 'note' || k === 'description')
    const rest = entries.filter(([k]) => !(k === 'notes' || k === 'note' || k === 'description'))
    return (
      <div>
        {notes && (
          <div style={{
            fontStyle: 'italic',
            color: 'var(--ink-fade)',
            fontSize: 14,
            lineHeight: 1.55,
            marginBottom: 12,
            padding: '10px 12px',
            background: 'rgba(69,128,248,.05)',
            borderLeft: '3px solid var(--primary)',
            borderRadius: 2,
          }}>
            {notes[1]}
          </div>
        )}
        {rest.map(([k, v]) => (
          <div key={k} style={{ marginBottom: 10 }}>
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '.1em',
              color: 'var(--ink-fade)',
              marginBottom: 4,
            }}>
              {humanizeKey(k)}
            </div>
            <div style={{ paddingLeft: depth > 0 ? 8 : 0 }}>
              <RichValue value={v} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Fallback
  return <pre style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{JSON.stringify(value, null, 2)}</pre>
}

function humanizeKey(k) {
  return k.replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// ────────────────────────────────────────────────────────────────────────────
// SENTINEL — keyword editor with version save + re-score
// ────────────────────────────────────────────────────────────────────────────

function SentinelPage() {
  const { selectedOip } = useOip()
  const [allSentinels, setAllSentinels] = useState([])
  const [viewingId, setViewingId] = useState(null)   // which sentinel tab is open
  const [sentinel, setSentinel] = useState(null)
  const [sentinelName, setSentinelName] = useState('')
  const [pullConfig, setPullConfig] = useState({})
  const [keywords, setKeywords] = useState([])
  const [stats, setStats] = useState({})
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState([])
  const [saving, setSaving] = useState(false)
  const [rescoring, setRescoring] = useState(false)
  const [bulkAdd, setBulkAdd] = useState('')
  const [analyticsView, setAnalyticsView] = useState('hit_count')
  const [analyticsCollapsed, setAnalyticsCollapsed] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const { memberships } = useAuth()
  const myRole = memberships.find(m => m.tenant_id === selectedOip?.tenant_id)?.role
  const canEdit = ['owner', 'admin'].includes(myRole)

  const loadAllSentinels = async (selectId = null) => {
    const { data: all } = await supabase
      .from('sentinels')
      .select('id, version, is_active, status, mode, match_fields, groups, name, pull_config')
      .eq('oip_id', selectedOip.id)
      .order('version', { ascending: false })
    setAllSentinels(all || [])
    const visible = (all || []).filter(s => showArchived || (s.status || 'inactive') !== 'archived')
    const target = selectId
      ? (all || []).find(s => s.id === selectId)
      : visible.find(s => s.is_active) || visible[0]
    if (target) await _loadSentinelDetail(target)
  }

  const _loadSentinelDetail = async (s) => {
    setViewingId(s.id)
    setSentinel(s)
    setSentinelName(s?.name || '')
    setPullConfig(s?.pull_config || {})
    setEditing(false)
    if (s) {
      const { data: kws } = await supabase
        .from('sentinel_keywords')
        .select('keyword, tier, group_name, is_watchlist')
        .eq('sentinel_id', s.id)
        .order('tier').order('group_name').order('keyword')
      setKeywords(kws || [])
      const { data: statsRows } = await supabase
        .from('sentinel_keyword_stats')
        .select('keyword, hit_count, strong_count, strong_rate, cooccur_count, cooccur_rate')
        .eq('sentinel_id', s.id)
      const m = {}
      ;(statsRows || []).forEach(r => { m[r.keyword.toLowerCase()] = r })
      setStats(m)
    }
  }

  const loadSentinel = () => loadAllSentinels()

  useEffect(() => { if (selectedOip) { loadAllSentinels(); } }, [selectedOip])

  const activateSentinel = async (s) => {
    if (s.is_active) return
    if ((s.status || 'inactive') === 'archived') {
      alert('Unarchive this sentinel before activating it.')
      return
    }
    if (!confirm(`Activate "${s.name || 'Sentinel v' + s.version}"? This deactivates all other sentinels for this OIP.`)) return
    await supabase.from('sentinels').update({ is_active: false, status: 'inactive' }).eq('oip_id', selectedOip.id)
    await supabase.from('sentinels').update({ is_active: true, status: 'active' }).eq('id', s.id)
    await loadAllSentinels(s.id)
  }

  const createNewSentinel = async () => {
    if (!confirm('Create a new blank sentinel? It will be inactive until you activate it.')) return
    const maxV = allSentinels.reduce((m, s) => Math.max(m, parseFloat(s.version) || 0), 0)
    const { data: ns, error } = await supabase.from('sentinels').insert({
      oip_id: selectedOip.id,
      version: String((maxV + 1).toFixed(1)),
      is_active: false,
      mode: 'ANY',
      match_fields: ['title', 'full_text'],
      name: 'New Sentinel',
      pull_config: {},
    }).select().single()
    if (error) { alert(error.message); return }
    await loadAllSentinels(ns.id)
  }

  const startEdit = () => { setDraft(JSON.parse(JSON.stringify(keywords))); setEditing(true) }

  const archiveSentinel = async (s) => {
    if (s.is_active) { alert('Deactivate this sentinel before archiving it.'); return }
    const label = s.name || `Sentinel v${s.version}`
    if (!confirm(`Archive "${label}"? It will be hidden from the tab strip but not deleted. You can unarchive it later.`)) return
    await supabase.from('sentinels').update({ status: 'archived', is_active: false }).eq('id', s.id)
    await loadAllSentinels()
  }

  const unarchiveSentinel = async (s) => {
    const label = s.name || `Sentinel v${s.version}`
    if (!confirm(`Restore "${label}" to inactive status?`)) return
    await supabase.from('sentinels').update({ status: 'inactive' }).eq('id', s.id)
    await loadAllSentinels(s.id)
  }

  const deleteSentinel = async (s) => {
    if (s.is_active) { alert('Deactivate this sentinel before deleting it.'); return }
    const nonArchivedCount = allSentinels.filter(x => (x.status || 'inactive') !== 'archived').length
    if (nonArchivedCount <= 1 && (s.status || 'inactive') !== 'archived') {
      alert('Cannot delete the only sentinel. Archive it instead, or create a new one first.')
      return
    }
    const label = s.name || `Sentinel v${s.version}`
    if (!confirm(`Permanently delete "${label}" and all its keywords? This cannot be undone.`)) return
    await supabase.from('sentinel_keywords').delete().eq('sentinel_id', s.id)
    await supabase.from('sentinels').delete().eq('id', s.id)
    await loadAllSentinels()
  }

  const saveAsNewVersion = async () => {
    // Duplicate config check — warn if another non-archived sentinel has identical collection config
    const configKey = s => JSON.stringify({
      mode: s.mode,
      fields: [...(s.match_fields || [])].sort(),
      pull: s.pull_config || {},
    })
    const newConfigKey = JSON.stringify({
      mode: sentinel.mode,
      fields: [...(sentinel.match_fields || [])].sort(),
      pull: pullConfig || {},
    })
    const duplicate = allSentinels.find(s =>
      s.id !== sentinel.id &&
      (s.status || 'inactive') !== 'archived' &&
      configKey(s) === newConfigKey
    )
    if (duplicate) {
      const dupLabel = duplicate.name || `Sentinel v${duplicate.version}`
      if (!confirm(`"${dupLabel}" has identical collection settings (same mode, match fields, and pull config). Only the keywords would differ — is that intentional?`)) return
    }
    if (!confirm('Save keywords as a new sentinel version? This becomes the new active sentinel.')) return
    setSaving(true)
    // Deactivate current
    await supabase.from('sentinels').update({ is_active: false, status: 'inactive' }).eq('oip_id', selectedOip.id)
    // Insert new sentinel
    const newVersion = String(parseFloat(sentinel.version) + 0.1).slice(0, 4)
      const { data: ns, error: nsErr } = await supabase.from('sentinels').insert({
      oip_id: selectedOip.id,
      version: newVersion,
      is_active: true,
      status: 'active',
      mode: sentinel.mode,
      match_fields: sentinel.match_fields,
      groups: sentinel.groups,
      name: sentinelName,
      pull_config: pullConfig,
    }).select().single()
    if (nsErr) { alert(nsErr.message); setSaving(false); return }
    // Insert keywords
    if (draft.length > 0) {
      const kwRows = draft.map(k => ({
        sentinel_id: ns.id,
        keyword: k.keyword.toLowerCase().trim(),
        tier: k.tier,
        group_name: k.group_name || 'general',
      }))
      const { error: kwErr } = await supabase.from('sentinel_keywords').insert(kwRows)
      if (kwErr) { alert(kwErr.message); setSaving(false); return }
    }
    setSaving(false)
    await loadSentinel()
    setEditing(false)
  }

  const rescore = async () => {
    if (!confirm('Re-score all in-retention signals for this OIP against the new sentinel? Other tenants and OIPs are not affected.')) return
    setRescoring(true)
    const { error } = await supabase.from('worker_jobs').insert({
      job_type: 'rescore',
      oip_id: selectedOip.id,
      vertical_id: selectedOip.vertical_id,
      payload: { triggered_by: 'manual_rescore' },
    })
    setRescoring(false)
    if (error) { alert(error.message); return }
    alert('Re-score job queued. The worker will pick it up on its next run (within 15 minutes).')
  }

  const bulkAddSubmit = () => {
    const lines = bulkAdd.split('\n').map(l => l.trim()).filter(Boolean)
    setDraft([
      ...draft,
      ...lines.map(kw => ({ keyword: kw, tier: 1, group_name: 'general' }))
    ])
    setBulkAdd('')
  }

  if (!sentinel) return <SectionLoader />
  const groupsByName = sentinel.groups || {}
  const groupNames = Object.keys(groupsByName).sort()
  const list = editing ? draft : keywords
  // Group rows by group_name for display
  const grouped = {}
  list.forEach(k => {
    const g = k.group_name || 'general'
    if (!grouped[g]) grouped[g] = []
    grouped[g].push(k)
  })
  const groupKeys = Object.keys(grouped).sort()

  const totalHits = keywords.length

  return (
    <div className="detail-section">

      {/* Sentinel selector tabs */}
      {allSentinels.length > 0 && (
        <div style={{ display: 'flex', gap: 0, marginBottom: 20,
          borderBottom: '2px solid var(--rule)', flexWrap: 'wrap', alignItems: 'center' }}>
          {allSentinels
            .filter(s => showArchived || (s.status || 'inactive') !== 'archived')
            .map(s => {
              const sStatus = s.status || (s.is_active ? 'active' : 'inactive')
              const isArchived = sStatus === 'archived'
              return (
                <button key={s.id} onClick={() => _loadSentinelDetail(s)} style={{
                  padding: '8px 16px', background: 'none', border: 'none',
                  borderBottom: viewingId === s.id ? '2px solid var(--primary)' : '2px solid transparent',
                  marginBottom: -2, cursor: 'pointer', fontSize: 12,
                  fontFamily: "'IBM Plex Mono', monospace", textTransform: 'uppercase', letterSpacing: '.07em',
                  fontWeight: viewingId === s.id ? 700 : 400,
                  color: isArchived ? 'var(--ink-faint)' : viewingId === s.id ? 'var(--primary)' : 'var(--ink-fade)',
                  opacity: isArchived ? 0.6 : 1,
                }}>
                  {s.name || `v${s.version}`}
                  {sStatus === 'active' && (
                    <span style={{ marginLeft: 6, fontSize: 9, background: 'var(--primary)',
                      color: 'white', borderRadius: 3, padding: '1px 4px', verticalAlign: 'middle' }}>
                      ACTIVE
                    </span>
                  )}
                  {isArchived && (
                    <span style={{ marginLeft: 6, fontSize: 9, background: 'var(--ink-faint)',
                      color: 'white', borderRadius: 3, padding: '1px 4px', verticalAlign: 'middle' }}>
                      ARCHIVED
                    </span>
                  )}
                </button>
              )
            })}
          {canEdit && (
            <button onClick={createNewSentinel} style={{
              marginLeft: 'auto', padding: '6px 12px', fontSize: 11,
              fontFamily: "'IBM Plex Mono', monospace", background: 'none',
              border: '1px solid var(--rule-strong)', borderRadius: 3,
              cursor: 'pointer', color: 'var(--ink-fade)',
            }}>
              + New Sentinel
            </button>
          )}
          {allSentinels.some(s => (s.status || 'inactive') === 'archived') && (
            <button onClick={() => setShowArchived(v => !v)} style={{
              marginLeft: canEdit ? 8 : 'auto', padding: '6px 10px', fontSize: 10,
              fontFamily: "'IBM Plex Mono', monospace", background: 'none',
              border: 'none', cursor: 'pointer', color: 'var(--ink-faint)',
              textTransform: 'uppercase', letterSpacing: '.07em',
            }}>
              {showArchived ? 'Hide archived' : 'Show archived'}
            </button>
          )}
        </div>
      )}

      <div className="detail-eyebrow">Sentinel · v{sentinel.version} · {sentinel.status || (sentinel.is_active ? 'active' : 'inactive')} · {keywords.length} keywords</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <h2 className="detail-title" style={{ margin: 0 }}>
          {sentinelName || 'Keyword vocabulary'}
          <HelpIcon topic="sentinel" />
        </h2>
        {canEdit && !sentinel.is_active && (sentinel.status || 'inactive') !== 'archived' && (
          <button onClick={() => activateSentinel(sentinel)} style={{
            padding: '6px 14px', background: 'var(--primary)', color: 'white',
            border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 12,
            fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
          }}>
            Activate
          </button>
        )}
      </div>
      
{editing && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block' }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--ink-fade)', marginBottom: 6 }}>
              Sentinel name
            </div>
            <input
              type="text"
              value={sentinelName}
              onChange={e => setSentinelName(e.target.value)}
              placeholder="e.g. Telecom Infrastructure"
              style={{ padding: '8px 12px', border: '1px solid var(--rule-strong)', borderRadius: 3, fontSize: 15, width: 340, fontFamily: "'IBM Plex Sans', sans-serif" }}
            />
          </label>
        </div>
      )}

      {/* Pull config — view mode summary */}
      {!editing && (
        <Block label="Collection config">
          {(!pullConfig.naics_codes?.length && !pullConfig.agency_ids?.length && !pullConfig.notice_types?.length) ? (
            <span style={{ color: 'var(--ink-faint)', fontSize: 13, fontStyle: 'italic' }}>
              Not configured — uses profile-level pull settings. Click Edit keywords to configure.
            </span>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--ink-light)', lineHeight: 1.9, fontFamily: "'IBM Plex Mono', monospace" }}>
              {pullConfig.naics_codes?.length > 0 && (
                <div><span style={{ color: 'var(--ink-fade)', marginRight: 12 }}>NAICS</span>{pullConfig.naics_codes.join(', ')}</div>
              )}
              {pullConfig.agency_ids?.length > 0 && (
                <div><span style={{ color: 'var(--ink-fade)', marginRight: 12 }}>Departments</span>{pullConfig.agency_ids.join(', ')}</div>
              )}
              {pullConfig.notice_types?.length > 0 && (
                <div><span style={{ color: 'var(--ink-fade)', marginRight: 12 }}>Notice types</span>{pullConfig.notice_types.join(', ')}</div>
              )}
              <div><span style={{ color: 'var(--ink-fade)', marginRight: 12 }}>Min deadline</span>{pullConfig.min_deadline_days ?? 30} days</div>
            </div>
          )}
        </Block>
      )}

      {/* Pull config — edit mode */}
      {editing && (
        <Block label="Collection config">
          <p style={{ fontSize: 13, color: 'var(--ink-fade)', marginBottom: 16, lineHeight: 1.5 }}>
            Controls what this sentinel fetches from SAM.gov. Each sentinel can target different agencies, NAICS codes, and notice types independently.
          </p>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--ink-fade)', marginBottom: 6 }}>
              NAICS codes (one per line)
            </div>
            <textarea
              className="form-textarea"
              rows={4}
              value={(pullConfig.naics_codes || []).join('\n')}
              onChange={e => setPullConfig({ ...pullConfig, naics_codes: e.target.value.split('\n').map(l => l.trim()).filter(Boolean) })}
              placeholder={'517312\n236220\n541330'}
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}
            />
          </div>

<div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--ink-fade)', marginBottom: 8 }}>
              Department (leave blank for all)
            </div>
            <DepartmentPicker
              selected={pullConfig.agency_ids || []}
              onChange={depts => setPullConfig({ ...pullConfig, agency_ids: depts })}
            />
          </div>


          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--ink-fade)', marginBottom: 8 }}>
              Notice types
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['Solicitation', 'Presolicitation', 'Sources Sought', 'Award Notice', 'Special Notice'].map(type => {
                const selected = (pullConfig.notice_types || []).includes(type)
                return (
                  <button key={type} onClick={() => {
                    const cur = pullConfig.notice_types || []
                    setPullConfig({ ...pullConfig, notice_types: selected ? cur.filter(t => t !== type) : [...cur, type] })
                  }} style={{
                    padding: '6px 12px', borderRadius: 3, cursor: 'pointer',
                    border: '1px solid ' + (selected ? 'var(--primary)' : 'var(--rule-strong)'),
                    background: selected ? 'var(--primary-soft)' : 'var(--paper)',
                    color: selected ? 'var(--primary-dark)' : 'var(--ink-light)',
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600,
                  }}>
                    {type}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 6 }}>
              Leave all unselected to collect all notice types
            </div>
          </div>

          <div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--ink-fade)', marginBottom: 6 }}>
              Minimum deadline days
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="number" min={0} max={365}
                value={pullConfig.min_deadline_days ?? 30}
                onChange={e => setPullConfig({ ...pullConfig, min_deadline_days: parseInt(e.target.value, 10) || 0 })}
                style={{ width: 72, padding: '8px 10px', border: '1px solid var(--rule-strong)', borderRadius: 3, fontSize: 15, fontFamily: "'IBM Plex Mono', monospace" }}
              />
              <span style={{ fontSize: 13, color: 'var(--ink-fade)' }}>days — only collect opportunities due at least this far out</span>
            </div>
          </div>
        </Block>
      )}


      <p className="detail-body" style={{ marginBottom: 24 }}>
        Tier 1 (primary) keywords drive matches. Tier 2 (secondary) augment. Tier 3 are exploratory. Tier 4 are watchlist — present
        but not currently matchable. Mode: <code>{sentinel.mode}</code> across <code>{(sentinel.match_fields || []).join(', ')}</code>.
      </p>

      {canEdit && (
        <div className="action-row" style={{ marginBottom: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {!editing ? (
            <button onClick={startEdit} className="btn-primary-link" style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              Edit keywords →
            </button>
          ) : (
            <>
              <button onClick={saveAsNewVersion} disabled={saving}
                style={{ padding: '10px 18px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 600 }}>
                {saving ? 'Saving…' : 'Save as new version'}
              </button>
              <button onClick={() => setEditing(false)}
                style={{ padding: '10px 18px', background: 'none', color: 'var(--ink-fade)', border: '1px solid var(--rule-strong)', borderRadius: 3, cursor: 'pointer' }}>
                Cancel
              </button>
            </>
          )}
          <button onClick={rescore} disabled={rescoring}
            style={{ padding: '10px 18px', background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--rule-strong)', borderRadius: 3, cursor: 'pointer', marginLeft: 'auto' }}>
            {rescoring ? 'Queueing…' : 'Re-score against current sentinel'}
          </button>
        </div>
      )}

      {editing && (
        <Block label="Bulk add (one keyword per line)">
          <div style={{ display: 'flex', gap: 12 }}>
            <textarea value={bulkAdd} onChange={e => setBulkAdd(e.target.value)} className="form-textarea" rows={3}
              style={{ flex: 1 }} placeholder="middle mile&#10;BEAD&#10;fiber" />
            <button onClick={bulkAddSubmit}
              style={{ padding: '10px 18px', background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--rule-strong)', borderRadius: 3, cursor: 'pointer', alignSelf: 'flex-start' }}>
              Add
            </button>
          </div>
        </Block>
      )}

      {!editing && <KeywordAnalytics keywords={keywords} stats={stats}
                       view={analyticsView} onViewChange={setAnalyticsView}
                       collapsed={analyticsCollapsed} onToggleCollapsed={() => setAnalyticsCollapsed(c => !c)} />}

      {groupKeys.map(gname => {
        const desc = groupsByName[gname]
        const rows = grouped[gname]
        return (
          <div key={gname} style={{ marginBottom: 32 }}>
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em',
              color: 'var(--ink-light)',
              marginBottom: 6,
            }}>
              {gname.replace(/_/g, ' ')} · {rows.length}
            </div>
            {desc && <div style={{ fontSize: 13, color: 'var(--ink-fade)', marginBottom: 12, fontStyle: 'italic' }}>{desc}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {rows.map((k, i) => (
                <KeywordPill
                  key={`${k.keyword}-${i}`}
                  k={k}
                  stats={stats[k.keyword.toLowerCase()]}
                  editing={editing}
                  onChangeTier={(newTier) => {
                    const idx = draft.findIndex(d => d.keyword === k.keyword && d.group_name === k.group_name)
                    if (idx >= 0) { const c = [...draft]; c[idx] = { ...c[idx], tier: newTier }; setDraft(c) }
                  }}
                  onRemove={() => {
                    setDraft(draft.filter(d => !(d.keyword === k.keyword && d.group_name === k.group_name)))
                  }}
                  groupNames={groupNames}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* Danger zone — archive / delete */}
      {canEdit && !editing && (
        <div style={{ marginTop: 48, paddingTop: 20, borderTop: '1px solid var(--rule)' }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--ink-faint)', marginBottom: 14 }}>
            Sentinel actions
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(sentinel.status || 'inactive') === 'archived' ? (
              <button onClick={() => unarchiveSentinel(sentinel)} style={{
                padding: '7px 14px', background: 'none', border: '1px solid var(--rule-strong)',
                borderRadius: 3, cursor: 'pointer', fontSize: 12,
                fontFamily: "'IBM Plex Mono', monospace", color: 'var(--ink-fade)',
              }}>
                Unarchive
              </button>
            ) : (
              <button onClick={() => archiveSentinel(sentinel)}
                disabled={sentinel.is_active}
                title={sentinel.is_active ? 'Deactivate before archiving' : undefined}
                style={{
                  padding: '7px 14px', background: 'none', border: '1px solid var(--rule-strong)',
                  borderRadius: 3, cursor: sentinel.is_active ? 'not-allowed' : 'pointer', fontSize: 12,
                  fontFamily: "'IBM Plex Mono', monospace",
                  color: sentinel.is_active ? 'var(--ink-faint)' : 'var(--ink-fade)',
                  opacity: sentinel.is_active ? 0.5 : 1,
                }}>
                Archive
              </button>
            )}
            <button onClick={() => deleteSentinel(sentinel)}
              disabled={sentinel.is_active}
              title={sentinel.is_active ? 'Deactivate before deleting' : undefined}
              style={{
                padding: '7px 14px', background: 'none',
                border: '1px solid ' + (sentinel.is_active ? 'var(--rule)' : '#f87171'),
                borderRadius: 3, cursor: sentinel.is_active ? 'not-allowed' : 'pointer', fontSize: 12,
                fontFamily: "'IBM Plex Mono', monospace",
                color: sentinel.is_active ? 'var(--ink-faint)' : '#ef4444',
                opacity: sentinel.is_active ? 0.5 : 1,
              }}>
              Delete
            </button>
          </div>
          {sentinel.is_active && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-faint)', fontStyle: 'italic' }}>
              Activate a different sentinel first to enable archive or delete.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// =====================================================================
// Sentinel keyword analytics — summary table at top of Sentinel page.
// Shows hit_count, strong_rate, cooccur_rate per keyword. Sortable.
// =====================================================================

function KeywordAnalytics({ keywords, stats, view, onViewChange, collapsed, onToggleCollapsed }) {
  // Merge keywords + stats into a single rows array. Keywords with zero
  // stats still appear so users can see "this keyword never matches"
  // — that's actionable info.
  const rows = keywords.map(k => {
    const s = stats[k.keyword.toLowerCase()] || {}
    return {
      keyword:        k.keyword,
      tier:           k.tier,
      group_name:     k.group_name,
      hit_count:      s.hit_count || 0,
      strong_count:   s.strong_count || 0,
      strong_rate:    parseFloat(s.strong_rate || 0),
      cooccur_count:  s.cooccur_count || 0,
      cooccur_rate:   parseFloat(s.cooccur_rate || 0),
    }
  })

  const total = rows.length
  const totalHits = rows.reduce((a, r) => a + r.hit_count, 0)
  const zeroHit = rows.filter(r => r.hit_count === 0).length
  const strongPredictors = rows.filter(r => r.hit_count >= 3 && r.strong_rate >= 0.5).length

  // Sort by selected view, then by hit_count desc as tiebreaker
  const sorted = [...rows].sort((a, b) => {
    const cmp = (b[view] || 0) - (a[view] || 0)
    if (cmp !== 0) return cmp
    return b.hit_count - a.hit_count
  })

  const viewOptions = [
    {
      key: 'hit_count',
      label: 'Hit count',
      def: 'Total number of scored signals where this keyword appeared.',
      example: 'A keyword that hits 30 times across 200 signals has hit_count = 30.',
    },
    {
      key: 'strong_rate',
      label: 'Strong rate',
      def: 'Of the signals this keyword matched, the % that were tier1_strong (multiple primary keywords matched). Higher is better — the keyword tends to fire on high-quality opportunities.',
      example: '"reconstruction" hits 30 signals, 24 of those were strong → strong rate = 80%.',
    },
    {
      key: 'cooccur_rate',
      label: 'Co-occur rate',
      def: 'Of the signals this keyword matched, the % that ALSO had at least one other tier1_strong match in the same signal. Identifies keywords that travel with strong matches even when they aren\'t the strong trigger themselves.',
      example: '"site work" hits 10 signals, 6 of those also matched a strong keyword → co-occur rate = 60%. It clusters with quality matches.',
    },
  ]

  return (
    <Block label="Keyword analytics">
      {/* Summary tiles */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16,
      }}>
        <AnalyticTile num={total}              label="Total keywords" />
        <AnalyticTile num={totalHits}          label="Total matches" />
        <AnalyticTile num={zeroHit}            label="Zero-hit keywords" warn={zeroHit > 0} />
        <AnalyticTile num={strongPredictors}   label="Strong predictors" hint="≥3 hits, ≥50% strong rate" />
      </div>

      {/* Definitions card — always visible, helps users interpret the table */}
      <div style={{
        background: 'var(--bg)',
        border: '1px solid var(--rule)',
        borderRadius: 3,
        padding: '14px 16px',
        marginBottom: 16,
        fontSize: 13,
        lineHeight: 1.55,
      }}>
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '.12em',
          color: 'var(--ink-fade)',
          marginBottom: 10,
        }}>How to read this</div>
        {viewOptions.map(opt => (
          <div key={opt.key} style={{ marginBottom: 8 }}>
            <span style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12, fontWeight: 600, color: 'var(--ink)',
              background: 'var(--paper)',
              padding: '2px 6px',
              borderRadius: 2,
              border: '1px solid var(--rule)',
              marginRight: 8,
            }}>{opt.label}</span>
            <span style={{ color: 'var(--ink-fade)' }}>{opt.def}</span>
            <div style={{ marginLeft: 8, marginTop: 3, color: 'var(--ink-faint)', fontSize: 12, fontStyle: 'italic' }}>
              Example: {opt.example}
            </div>
          </div>
        ))}
      </div>

      {/* Toggle to collapse the table for users who don't need it */}
      <button onClick={onToggleCollapsed}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
          color: 'var(--primary)', padding: 0, marginBottom: 12,
        }}>
        {collapsed ? '▶ Show full table' : '▼ Hide full table'}
      </button>

      {!collapsed && (
        <>
          <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--ink-fade)', fontFamily: "'IBM Plex Mono', monospace" }}>
            Sort by:
            {viewOptions.map(opt => (
              <button key={opt.key} onClick={() => onViewChange(opt.key)}
                title={opt.def}
                style={{
                  marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12,
                  color: view === opt.key ? 'var(--primary-dark)' : 'var(--ink-fade)',
                  fontWeight: view === opt.key ? 600 : 400,
                  textDecoration: view === opt.key ? 'underline' : 'none',
                }}>{opt.label}</button>
            ))}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                <th style={th}>Keyword</th>
                <th style={th}>Tier</th>
                <th style={th}>Group</th>
                <th style={{ ...th, textAlign: 'right' }} title="Total signals where this keyword matched">Hits</th>
                <th style={{ ...th, textAlign: 'right' }} title="Of those, how many were tier1_strong">Strong</th>
                <th style={{ ...th, textAlign: 'right' }} title="strong_count / hit_count">Strong rate</th>
                <th style={{ ...th, textAlign: 'right' }} title="Signals where this keyword AND any tier1_strong keyword both matched, divided by hit_count">Co-occur rate</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 50).map(r => (
                <tr key={`${r.keyword}-${r.group_name}`}
                  style={{ borderBottom: '1px solid var(--rule)',
                    background: r.hit_count === 0 ? 'rgba(160,24,24,.04)' : 'transparent' }}>
                  <td style={{ ...td, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
                    {r.keyword}
                  </td>
                  <td style={td}><TierBadge tier={r.tier} /></td>
                  <td style={{ ...td, color: 'var(--ink-fade)', fontSize: 12 }}>
                    {r.group_name?.replace(/_/g, ' ')}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.hit_count === 0
                      ? <span style={{ color: 'var(--tier1-strong)' }}>0</span>
                      : r.hit_count}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.strong_count}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.hit_count === 0 ? '—' : <RateBar value={r.strong_rate} />}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.hit_count === 0 ? '—' : <RateBar value={r.cooccur_rate} muted />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length > 50 && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-fade)' }}>
              Showing top 50 of {sorted.length} keywords. Use sort buttons above to find what you need.
            </div>
          )}
        </>
      )}
    </Block>
  )
}

function AnalyticTile({ num, label, warn, hint }) {
  return (
    <div style={{
      padding: '12px 14px',
      border: '1px solid ' + (warn ? 'var(--warn-border)' : 'var(--rule)'),
      borderRadius: 3,
      background: warn ? 'var(--warn-bg)' : 'var(--paper)',
    }}>
      <div style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 22, fontWeight: 500, color: 'var(--ink)', lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>{num}</div>
      <div style={{
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em',
        color: 'var(--ink-fade)', marginTop: 6,
      }}>{label}</div>
      {hint && <div style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 3, fontStyle: 'italic' }}>{hint}</div>}
    </div>
  )
}

function TierBadge({ tier }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 6px', borderRadius: 2,
      fontSize: 10, fontWeight: 600,
      fontFamily: "'IBM Plex Mono', monospace",
      background: tier === 1 ? 'var(--primary-soft)' : tier === 2 ? '#fef4e6' : tier === 3 ? '#e8f0e8' : '#f0f0f0',
      color: tier === 1 ? 'var(--primary-dark)' : tier === 2 ? '#875214' : tier === 3 ? '#2a3e2e' : '#6b7280',
    }}>T{tier}</span>
  )
}

function RateBar({ value, muted }) {
  const pct = Math.round(value * 100)
  const barColor = muted ? '#9d9788' : (pct >= 50 ? '#0d5e44' : pct >= 25 ? '#875214' : 'var(--ink-faint)')
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 12 }}>{pct}%</span>
      <div style={{
        width: 36, height: 6, background: '#e5e1d4', borderRadius: 1, overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: barColor,
        }}></div>
      </div>
    </div>
  )
}

function KeywordPill({ k, stats, editing, onChangeTier, onRemove }) {
  const tier = k.tier
  const cls = tier === 1 ? 'kw-tier1' : tier === 2 ? 'kw-tier2' : tier === 3 ? 'kw-tier3' : 'kw-tier4'
  // Decide what badge to show inline:
  //   - if no stats yet → nothing
  //   - if hit_count = 0 → red "0" (dead keyword)
  //   - else show hit_count, with strong-rate as a small dot color
  const hits = stats?.hit_count ?? null
  const strongRate = stats?.strong_rate ?? 0
  const rateColor =
    strongRate >= 0.5 ? '#0d5e44' :
    strongRate >= 0.25 ? '#875214' :
    'var(--ink-faint)'
  return (
    <span className={`kw-pill ${cls}`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 10px',
      borderRadius: 3,
    }}>
      <span>{k.keyword}</span>
      {hits !== null && !editing && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          marginLeft: 4,
          paddingLeft: 8,
          borderLeft: '1px solid rgba(0,0,0,.12)',
          fontSize: 10,
          fontFamily: "'IBM Plex Mono', monospace",
          color: hits === 0 ? 'var(--tier1-strong)' : 'var(--ink-fade)',
          fontVariantNumeric: 'tabular-nums',
        }}
        title={hits === 0
          ? 'No matches yet'
          : `${hits} hits, ${Math.round(strongRate * 100)}% on strong-tier signals`}>
          {hits}
          {hits > 0 && (
            <span style={{
              display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
              background: rateColor,
            }}></span>
          )}
        </span>
      )}
      {editing ? (
        <>
          <select value={tier} onChange={e => onChangeTier(parseInt(e.target.value, 10))}
            style={{ marginLeft: 6, fontSize: 11, padding: '1px 4px', border: '1px solid var(--rule-strong)', background: 'var(--paper)' }}>
            {[1, 2, 3, 4].map(t => <option key={t} value={t}>T{t}</option>)}
          </select>
          <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tier1-strong)', padding: 0, fontSize: 13 }}>×</button>
        </>
      ) : (
        <span style={{ fontSize: 10, opacity: .65 }}>T{tier}</span>
      )}
    </span>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// PURSUED PIPELINE
// ────────────────────────────────────────────────────────────────────────────

function PursuedPage() {
  const { selectedOip } = useOip()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedOip) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const { data } = await supabase
        .from('pursued_signals')
        .select('id, signal_id, snapshot, pipeline_stage, notes, pursued_at')
        .eq('oip_id', selectedOip.id)
        .order('pursued_at', { ascending: false })
      if (cancelled) return
      setItems(data || [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [selectedOip])

  const updateStage = async (id, stage) => {
    const { error } = await supabase.from('pursued_signals').update({ pipeline_stage: stage }).eq('id', id)
    if (error) alert(error.message)
    else setItems(prev => prev.map(it => it.id === id ? { ...it, pipeline_stage: stage } : it))
  }

  if (loading) return <SectionLoader />
  if (items.length === 0) {
    return <EmptyMessage title="No pursued items yet" message="Move a signal into the pursued pipeline from Market Review to track it here." />
  }

  const stages = ['identified', 'qualifying', 'pursuing', 'won', 'lost']
  const grouped = {}
  stages.forEach(s => grouped[s] = [])
  items.forEach(it => { grouped[it.pipeline_stage]?.push(it) || (grouped['identified'] = grouped['identified'] || []).push(it) })

  return (
    <div className="detail-section">
      <div className="detail-eyebrow">Pursued Pipeline · {items.length} active</div>
      <h2 className="detail-title">Your pursued opportunities<HelpIcon topic="pursued" /></h2>
      {stages.map(stage => grouped[stage].length === 0 ? null : (
        <div key={stage} style={{ marginTop: 24 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--ink-light)', marginBottom: 12 }}>
            {stage} · {grouped[stage].length}
          </div>
          {grouped[stage].map(it => (
            <div key={it.id} className="signal-card" style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--ink-fade)', marginBottom: 6 }}>
                {it.snapshot.state} · {it.snapshot.source_name} · pursued {new Date(it.pursued_at).toLocaleDateString()}
              </div>
              <div style={{ fontFamily: "'Spectral', serif", fontSize: 16, marginBottom: 8 }}>{it.snapshot.title}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {stages.map(s => (
                  <button key={s} onClick={() => updateStage(it.id, s)}
                    style={{
                      padding: '4px 10px',
                      border: '1px solid ' + (it.pipeline_stage === s ? 'var(--primary)' : 'var(--rule-strong)'),
                      background: it.pipeline_stage === s ? 'var(--primary-soft)' : 'var(--paper)',
                      color: it.pipeline_stage === s ? 'var(--primary-dark)' : 'var(--ink-fade)',
                      borderRadius: 3, cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
                    }}>
                    {s}
                  </button>
                ))}
                {it.snapshot.doc_url && (
                  <a href={it.snapshot.doc_url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto', fontSize: 13 }}>
                    Source ↗
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// SETTINGS — landing
// ────────────────────────────────────────────────────────────────────────────

function SettingsPage() {
  return (
    <div className="detail-section">
      <div className="detail-eyebrow">Settings</div>
      <h2 className="detail-title">Account, team, and OIP configuration</h2>
      <div className="us-grid" style={{ marginTop: 24 }}>
        <Link to="/settings/team" className="us-card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="us-eyebrow">Team</div>
          <div className="us-title">Members & invites</div>
          <div className="us-body">Invite new team members; manage roles and access.</div>
        </Link>
        <Link to="/settings/subscriptions" className="us-card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="us-eyebrow">Subscription</div>
          <div className="us-title">States & tier</div>
          <div className="us-body">Manage which states or verticals this OIP scrapes.</div>
        </Link>
        <Link to="/settings/integrations" className="us-card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="us-eyebrow">Integrations</div>
          <div className="us-title">API keys</div>
          <div className="us-body">Connect external data sources (SAM.gov and future verticals).</div>
        </Link>
        <Link to="/settings/runs" className="us-card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="us-eyebrow">Operations</div>
          <div className="us-title">Run history</div>
          <div className="us-body">Past scrape and score runs, status, and stats.</div>
        </Link>
        <Link to="/account" className="us-card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="us-eyebrow">Account</div>
          <div className="us-title">Your account</div>
          <div className="us-body">Change password, view your profile.</div>
        </Link>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// TEAM MEMBERS — list, invite, role changes
// ────────────────────────────────────────────────────────────────────────────

function TeamPage() {
  const { selectedOip } = useOip()
  const { user, memberships } = useAuth()
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const myRole = memberships.find(m => m.tenant_id === selectedOip?.tenant_id)?.role
  const canManage = ['owner', 'admin'].includes(myRole)

  const reload = async () => {
    if (!selectedOip) return
    setLoading(true)
    const { data: m } = await supabase
      .from('tenant_members')
      .select('user_id, role, created_at')
      .eq('tenant_id', selectedOip.tenant_id)
    const { data: i } = await supabase
      .from('tenant_invites')
      .select('id, email, role, invited_at, expires_at, accepted_at')
      .eq('tenant_id', selectedOip.tenant_id)
      .is('accepted_at', null)
      .order('invited_at', { ascending: false })
    setMembers(m || [])
    setInvites(i || [])
    setLoading(false)
  }

  useEffect(() => { reload() }, [selectedOip])

  if (!canManage) {
    return <EmptyMessage title="Insufficient permissions" message="Only tenant admins can manage the team. Ask your admin if you need access." />
  }

  if (loading) return <SectionLoader />

  return (
    <div className="detail-section">
      <div className="detail-eyebrow">Team · {selectedOip.tenants?.name}</div>
      <h2 className="detail-title">Team members & invites<HelpIcon topic="team" /></h2>

      <Block label={`Members (${members.length})`}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--rule)', textAlign: 'left' }}>
              <th style={th}>User ID</th>
              <th style={th}>Role</th>
              <th style={th}>Joined</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.user_id} style={{ borderBottom: '1px solid var(--rule)' }}>
                <td style={td}>{m.user_id === user.id ? <strong>{m.user_id} (you)</strong> : m.user_id}</td>
                <td style={td}>{m.role}</td>
                <td style={td}>{new Date(m.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Block>

      <Block label={`Pending invites (${invites.length})`}>
        {invites.length === 0 ? <div style={{ color: 'var(--ink-fade)' }}>No pending invites.</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--rule)', textAlign: 'left' }}>
                <th style={th}>Email</th>
                <th style={th}>Role</th>
                <th style={th}>Sent</th>
                <th style={th}>Expires</th>
              </tr>
            </thead>
            <tbody>
              {invites.map(inv => (
                <tr key={inv.id} style={{ borderBottom: '1px solid var(--rule)' }}>
                  <td style={td}>{inv.email}</td>
                  <td style={td}>{inv.role}</td>
                  <td style={td}>{new Date(inv.invited_at).toLocaleDateString()}</td>
                  <td style={td}>{new Date(inv.expires_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Block>

      <button onClick={() => setShowInvite(true)}
        style={{ padding: '10px 18px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 600 }}>
        + Invite team member
      </button>

      {showInvite && <InviteModal tenantId={selectedOip.tenant_id} onClose={() => { setShowInvite(false); reload() }} />}
    </div>
  )
}

const th = { padding: '10px 12px', fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--ink-fade)' }
const td = { padding: '12px', fontSize: 14 }

function InviteModal({ tenantId, onClose }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setErr(null); setBusy(true)
    // Insert invite — DB-level trigger or edge function will email
    const { data, error } = await supabase.rpc('create_tenant_invite', {
      p_tenant_id: tenantId,
      p_email: email,
      p_role: role,
    })
    setBusy(false)
    if (error) setErr(error.message)
    else {
      // Best-effort: invoke edge function to send the email; ignore errors
      // (the function will log if Resend isn't configured)
      try {
        await supabase.functions.invoke('invite-email', { body: { invite_id: data } })
      } catch (_) {}
      onClose()
    }
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--paper)', padding: 32, borderRadius: 4, maxWidth: 440, width: '90%' }}>
        <h2 style={{ fontFamily: "'Spectral', serif", fontSize: 22, marginBottom: 16 }}>Invite team member</h2>
        <form onSubmit={submit}>
          <AuthField label="Email" type="email" value={email} onChange={setEmail} required />
          <label style={{ display: 'block', marginBottom: 16 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--ink-fade)', marginBottom: 6 }}>Role</div>
            <select value={role} onChange={e => setRole(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--rule-strong)', borderRadius: 3, fontSize: 15 }}>
              <option value="viewer">Viewer (read-only)</option>
              <option value="member">Member (can edit signals)</option>
              <option value="admin">Admin (can edit OIP, profile, sentinel, invite team)</option>
            </select>
          </label>
          {err && <div className="auth-error">{err}</div>}
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="submit" disabled={busy} style={{ flex: 1, padding: '10px 18px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 600 }}>
              {busy ? 'Sending…' : 'Send invite'}
            </button>
            <button type="button" onClick={onClose} style={{ padding: '10px 18px', background: 'none', color: 'var(--ink-fade)', border: '1px solid var(--rule-strong)', borderRadius: 3, cursor: 'pointer' }}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTIONS — vertical-aware: SAM gets a different view than SLED
// ────────────────────────────────────────────────────────────────────────────

function SubscriptionsPage() {
  const { selectedOip } = useOip()
  const [verticalSlug, setVerticalSlug] = useState(null)
  const [loadingVertical, setLoadingVertical] = useState(true)

  useEffect(() => {
    if (!selectedOip?.vertical_id) return
    setLoadingVertical(true)
    supabase
      .from('verticals')
      .select('slug')
      .eq('id', selectedOip.vertical_id)
      .single()
      .then(({ data }) => {
        setVerticalSlug(data?.slug ?? null)
        setLoadingVertical(false)
      })
  }, [selectedOip?.vertical_id])

  if (loadingVertical) return <SectionLoader />
  if (verticalSlug === 'sam') return <SamSubscriptionsView />
  return <SledSubscriptionsView />
}

function SledSubscriptionsView() {
  const { selectedOip } = useOip()
  const [subs, setSubs] = useState([])
  const [tier, setTier] = useState(null)
  const [allTiers, setAllTiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState([])
  const [groupings, setGroupings] = useState([])
  const [recentRuns, setRecentRuns] = useState([])
  const { memberships } = useAuth()
  const myRole = memberships.find(m => m.tenant_id === selectedOip?.tenant_id)?.role
  const canManage = ['owner', 'admin'].includes(myRole)

  const reload = async () => {
    if (!selectedOip) return
    setLoading(true)
    const { data: s } = await supabase.from('oip_subscriptions').select('id, state, is_active').eq('oip_id', selectedOip.id)
    const { data: t } = await supabase.from('subscription_tiers').select('*').order('min_states')
    const { data: o } = await supabase.from('oips').select('subscription_tier').eq('id', selectedOip.id).single()
    const { data: gs } = await supabase
      .from('state_groupings')
      .select('id, slug, name, states, scrape_cron')
      .eq('vertical_id', selectedOip.vertical_id)
    const { data: runs } = await supabase
      .from('scrape_runs')
      .select('state, status, started_at, finished_at, state_grouping_id')
      .eq('vertical_id', selectedOip.vertical_id)
      .order('started_at', { ascending: false })
      .limit(120)
    const allStates = [...new Set((gs || []).flatMap(g => g.states))].sort()
    setSubs(s || [])
    setAllTiers(t || [])
    setTier(t?.find(x => x.slug === o?.subscription_tier))
    setAvailable(allStates)
    setGroupings(gs || [])
    setRecentRuns(runs || [])
    setLoading(false)
  }

  useEffect(() => { reload() }, [selectedOip])

  const toggleState = async (state, isActive) => {
    if (!isActive) {
      const existing = subs.find(s => s.state === state)
      if (existing) {
        await supabase.from('oip_subscriptions').update({ is_active: true }).eq('id', existing.id)
      } else {
        await supabase.from('oip_subscriptions').insert({ oip_id: selectedOip.id, state, is_active: true })
      }
    } else {
      const existing = subs.find(s => s.state === state)
      if (existing) await supabase.from('oip_subscriptions').update({ is_active: false }).eq('id', existing.id)
    }
    reload()
  }

  if (loading) return <SectionLoader />
  const activeStates = subs.filter(s => s.is_active).map(s => s.state)
  const coverage = buildCoverageView(activeStates, groupings, recentRuns)

  return (
    <div className="detail-section">
      <div className="detail-eyebrow">Subscription · {tier?.display_name}</div>
      <h2 className="detail-title">States covered by this OIP<HelpIcon topic="subscriptions" /></h2>
      <p className="detail-body" style={{ marginBottom: 24 }}>
        Tier: <strong>{tier?.display_name}</strong> ({tier?.min_states}–{tier?.max_states ?? '∞'} states).
        Currently subscribed to <strong>{activeStates.length}</strong> state{activeStates.length === 1 ? '' : 's'}.
      </p>

      <Block label="Coverage schedule">
        {coverage.length === 0 ? (
          <div style={{ color: 'var(--ink-fade)', fontSize: 14 }}>No active subscriptions yet. Toggle a state below to start.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                <th style={th}>State</th>
                <th style={th}>Grouping</th>
                <th style={th}>Last scrape</th>
                <th style={th}>Status</th>
                <th style={th}>Next scrape</th>
              </tr>
            </thead>
            <tbody>
              {coverage.map(c => (
                <tr key={c.state} style={{ borderBottom: '1px solid var(--rule)' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{c.state}</td>
                  <td style={{ ...td, color: 'var(--ink-fade)' }}>{c.groupingName || '—'}</td>
                  <td style={{ ...td, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
                    {c.lastScrapeAt
                      ? new Date(c.lastScrapeAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : <span style={{ color: 'var(--ink-faint)' }}>never</span>}
                  </td>
                  <td style={td}>
                    {c.lastStatus
                      ? <RunStatusBadge status={c.lastStatus} />
                      : <span style={{ color: 'var(--ink-faint)', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ ...td, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
                    {c.nextLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Block>

      <Block label="Toggle state subscriptions">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {available.map(st => {
            const isActive = activeStates.includes(st)
            return (
              <button
                key={st}
                onClick={() => canManage && toggleState(st, isActive)}
                disabled={!canManage}
                style={{
                  padding: '8px 14px',
                  border: '1px solid ' + (isActive ? 'var(--primary)' : 'var(--rule-strong)'),
                  background: isActive ? 'var(--primary-soft)' : 'var(--paper)',
                  color: isActive ? 'var(--primary-dark)' : 'var(--ink-light)',
                  borderRadius: 3, cursor: canManage ? 'pointer' : 'default',
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600,
                }}>
                {st} {isActive && '✓'}
              </button>
            )
          })}
        </div>
        {!canManage && (
          <p style={{ marginTop: 12, fontSize: 12, color: 'var(--ink-fade)', fontStyle: 'italic' }}>
            Only admins can change subscriptions. Contact a tenant admin to add or remove states.
          </p>
        )}
      </Block>

      <Block label="Available tiers">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid var(--rule)' }}><th style={th}>Tier</th><th style={th}>States</th><th style={th}>Description</th></tr></thead>
          <tbody>
            {allTiers.map(t => (
              <tr key={t.slug} style={{ borderBottom: '1px solid var(--rule)', background: t.slug === tier?.slug ? 'var(--primary-soft)' : 'transparent' }}>
                <td style={td}><strong>{t.display_name}</strong> {t.slug === tier?.slug && '(current)'}</td>
                <td style={td}>{t.min_states}–{t.max_states ?? '∞'}</td>
                <td style={td}>{t.description || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-fade)' }}>
          Need a different tier? Contact support.
        </p>
      </Block>
    </div>
  )
}

function SamSubscriptionsView() {
  const { selectedOip } = useOip()
  const { memberships } = useAuth()
  const myRole = memberships.find(m => m.tenant_id === selectedOip?.tenant_id)?.role
  const canManage = ['owner', 'admin'].includes(myRole)
  const [sub, setSub] = useState(null)
  const [apiKey, setApiKey] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  const reload = async () => {
    if (!selectedOip) return
    setLoading(true)
    const [{ data: s }, { data: k }] = await Promise.all([
      supabase.from('sam_subscriptions').select('id, is_active').eq('oip_id', selectedOip.id).maybeSingle(),
      supabase.from('tenant_api_keys')
        .select('key_hint, expires_at, updated_at')
        .eq('tenant_id', selectedOip.tenant_id)
        .eq('vertical_id', selectedOip.vertical_id)
        .maybeSingle(),
    ])
    setSub(s); setApiKey(k); setLoading(false)
  }

  useEffect(() => { reload() }, [selectedOip])

  const toggleActive = async () => {
    if (!canManage) return
    setToggling(true)
    const newActive = !(sub?.is_active ?? false)
    if (sub) {
      await supabase.from('sam_subscriptions').update({ is_active: newActive }).eq('id', sub.id)
    } else {
      await supabase.from('sam_subscriptions').insert({ oip_id: selectedOip.id, is_active: true })
    }
    await reload()
    setToggling(false)
  }

  if (loading) return <SectionLoader />

  const isActive = sub?.is_active ?? false
  const expiresAt = apiKey?.expires_at ? new Date(apiKey.expires_at) : null
  const daysUntilExpiry = expiresAt ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000)) : null
  const isExpired = expiresAt && expiresAt <= new Date()
  const isWarn = !isExpired && daysUntilExpiry !== null && daysUntilExpiry <= 14

  return (
    <div className="detail-section">
      <div className="detail-eyebrow">Subscription · Federal (SAM.gov)</div>
      <h2 className="detail-title">Federal procurement coverage</h2>
      <p className="detail-body" style={{ marginBottom: 24 }}>
        SAM.gov is a national feed — not partitioned by state. When active, this OIP
        fetches federal opportunities matching the NAICS codes and filters in your profile.
      </p>

      <Block label="Federal (SAM.gov) coverage">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <button
            onClick={toggleActive}
            disabled={!canManage || toggling}
            style={{
              padding: '10px 20px',
              border: '1px solid ' + (isActive ? 'var(--primary)' : 'var(--rule-strong)'),
              background: isActive ? 'var(--primary-soft)' : 'var(--paper)',
              color: isActive ? 'var(--primary-dark)' : 'var(--ink-light)',
              borderRadius: 3, cursor: canManage ? 'pointer' : 'default',
              fontWeight: 600, fontSize: 14,
            }}>
            {toggling ? '…' : isActive ? '✓ Active' : 'Inactive'}
          </button>
          <span style={{ fontSize: 13, color: 'var(--ink-fade)' }}>
            {isActive
              ? 'This OIP is subscribed to SAM.gov federal opportunities.'
              : 'Toggle to enable SAM.gov scraping for this OIP.'}
          </span>
        </div>
        {!canManage && (
          <p style={{ marginTop: 12, fontSize: 12, color: 'var(--ink-fade)', fontStyle: 'italic' }}>
            Only admins can change subscriptions.
          </p>
        )}
      </Block>

      <Block label="SAM.gov API key">
        {apiKey ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <code style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, background: 'var(--primary-soft)', padding: '4px 10px', borderRadius: 3 }}>
                {apiKey.key_hint}
              </code>
              {isExpired && (
                <span style={{ fontSize: 12, fontWeight: 600, color: '#c0392b', background: '#fdecea', padding: '3px 8px', borderRadius: 3 }}>
                  Expired — SAM scraping paused
                </span>
              )}
              {isWarn && !isExpired && (
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--warn-border)', background: 'var(--warn-bg)', padding: '3px 8px', borderRadius: 3 }}>
                  Expires in {daysUntilExpiry} day{daysUntilExpiry === 1 ? '' : 's'} — replace soon
                </span>
              )}
              {!isWarn && !isExpired && (
                <span style={{ fontSize: 12, color: 'var(--ink-fade)' }}>
                  Expires {expiresAt?.toLocaleDateString()}
                </span>
              )}
            </div>
            <p style={{ marginTop: 10, fontSize: 13, color: 'var(--ink-fade)' }}>
              To replace this key, go to{' '}
              <Link to="/settings/integrations" style={{ color: 'var(--primary)' }}>Settings → Integrations</Link>.
            </p>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--ink-fade)' }}>
            No SAM.gov API key on file. Add one in{' '}
            <Link to="/settings/integrations" style={{ color: 'var(--primary)' }}>Settings → Integrations</Link>{' '}
            before enabling this subscription.
          </p>
        )}
      </Block>
    </div>
  )
}

function IntegrationsPage() {
  const { selectedOip } = useOip()
  const { memberships } = useAuth()
  const myRole = memberships.find(m => m.tenant_id === selectedOip?.tenant_id)?.role
  const canManage = ['owner', 'admin'].includes(myRole)
  const [samKey, setSamKey] = useState(null)
  const [samVerticalId, setSamVerticalId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showKeyForm, setShowKeyForm] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState(null)
  const [saveOk, setSaveOk] = useState(false)

  const reload = async () => {
    if (!selectedOip) return
    setLoading(true)
    const { data: v } = await supabase.from('verticals').select('id').eq('slug', 'sam').single()
    const vid = v?.id ?? null
    setSamVerticalId(vid)
    if (vid) {
      const { data: k } = await supabase
        .from('tenant_api_keys')
        .select('key_hint, expires_at, updated_at')
        .eq('tenant_id', selectedOip.tenant_id)
        .eq('vertical_id', vid)
        .maybeSingle()
      setSamKey(k ?? null)
    }
    setLoading(false)
  }

  useEffect(() => { reload() }, [selectedOip])

  const saveKey = async () => {
    if (!keyInput.trim() || keyInput.trim().length < 10) {
      setSaveErr('Key looks too short — paste your full SAM.gov API key.')
      return
    }
    setSaving(true); setSaveErr(null); setSaveOk(false)
    try {
      const { data, error } = await supabase.functions.invoke('save-api-key', {
        body: { vertical_slug: 'sam', key: keyInput.trim() },
      })
      if (error) throw error
      if (data?.hint) {
        setSaveOk(true); setKeyInput(''); setShowKeyForm(false)
        await reload()
      } else {
        setSaveErr('Unexpected response from server. Try again.')
      }
    } catch (e) {
      setSaveErr(e.message || 'Failed to save key.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <SectionLoader />

  const expiresAt = samKey?.expires_at ? new Date(samKey.expires_at) : null
  const daysUntilExpiry = expiresAt ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000)) : null
  const isExpired = expiresAt && expiresAt <= new Date()
  const isWarn = !isExpired && daysUntilExpiry !== null && daysUntilExpiry <= 14

  return (
    <div className="detail-section">
      <div className="detail-eyebrow">Settings · Integrations</div>
      <h2 className="detail-title">API keys</h2>
      <p className="detail-body" style={{ marginBottom: 28 }}>
        Connect external data sources by providing your own API keys. Keys are encrypted
        at rest and never displayed in full after saving.
      </p>

      <Block label="SAM.gov — Federal procurement">
        {samKey ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <code style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, background: 'var(--primary-soft)', padding: '4px 10px', borderRadius: 3 }}>
                {samKey.key_hint}
              </code>
              {isExpired && (
                <span style={{ fontSize: 12, fontWeight: 600, color: '#c0392b', background: '#fdecea', padding: '3px 8px', borderRadius: 3 }}>
                  ⚠ Expired — SAM scraping is paused
                </span>
              )}
              {isWarn && !isExpired && (
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--warn-border)', background: 'var(--warn-bg)', padding: '3px 8px', borderRadius: 3 }}>
                  Expires in {daysUntilExpiry} day{daysUntilExpiry === 1 ? '' : 's'}
                </span>
              )}
              {!isWarn && !isExpired && expiresAt && (
                <span style={{ fontSize: 12, color: 'var(--ink-fade)' }}>
                  Expires {expiresAt.toLocaleDateString()}
                </span>
              )}
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-fade)', marginBottom: 12 }}>
              SAM.gov API keys expire every 90 days.{" "}
              <a href="https://sam.gov/profile/details" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
                Get a new key at sam.gov
              </a>.
            </p>
            {canManage && !showKeyForm && (
              <button onClick={() => { setShowKeyForm(true); setSaveOk(false) }}
                style={{ padding: '8px 16px', border: '1px solid var(--rule-strong)', background: 'var(--paper)', borderRadius: 3, cursor: 'pointer', fontSize: 13 }}>
                Replace key
              </button>
            )}
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: 'var(--ink-fade)', marginBottom: 12 }}>
              No SAM.gov API key on file. Paste your key below to enable federal procurement scraping.{" "}
              <a href="https://sam.gov/profile/details" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
                Get your key at sam.gov →
              </a>
            </p>
            {canManage && !showKeyForm && (
              <button onClick={() => setShowKeyForm(true)}
                style={{ padding: '8px 16px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                + Add SAM.gov key
              </button>
            )}
          </div>
        )}

        {canManage && showKeyForm && (
          <div style={{ marginTop: 16, padding: 16, background: 'var(--bg)', borderRadius: 4, border: '1px solid var(--rule)' }}>
            <label style={{ display: 'block', marginBottom: 8 }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--ink-fade)', marginBottom: 6 }}>
                SAM.gov API key
              </div>
              <input
                type="password"
                value={keyInput}
                onChange={e => { setKeyInput(e.target.value); setSaveErr(null) }}
                placeholder="Paste your SAM.gov API key…"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--rule-strong)', borderRadius: 3, fontSize: 14, fontFamily: "'IBM Plex Mono', monospace", boxSizing: 'border-box' }}
              />
            </label>
            {saveErr && <div style={{ fontSize: 13, color: '#c0392b', marginBottom: 8 }}>{saveErr}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveKey} disabled={saving || !keyInput.trim()}
                style={{ padding: '9px 18px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {saving ? 'Saving…' : 'Save key'}
              </button>
              <button onClick={() => { setShowKeyForm(false); setKeyInput(''); setSaveErr(null) }}
                style={{ padding: '9px 14px', background: 'none', color: 'var(--ink-fade)', border: '1px solid var(--rule-strong)', borderRadius: 3, cursor: 'pointer', fontSize: 13 }}>
                Cancel
              </button>
            </div>
            <p style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-fade)' }}>
              Your key is encrypted before storage and cannot be retrieved after saving.
            </p>
          </div>
        )}

        {saveOk && (
          <div style={{ marginTop: 12, fontSize: 13, color: '#1a7f4b', fontWeight: 600 }}>
            ✓ Key saved successfully.
          </div>
        )}

        {!canManage && (
          <p style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-fade)', fontStyle: 'italic' }}>
            Only owners and admins can manage API keys.
          </p>
        )}
      </Block>

      <Block label="Future integrations">
        <p style={{ fontSize: 13, color: 'var(--ink-fade)' }}>
          Additional data sources will appear here as they become available.
        </p>
      </Block>
    </div>
  )
}

// =====================================================================
// buildCoverageView — for each active subscribed state, derive:
//   - which state grouping it lives in (NE/SE/MW/SW/W)
//   - when the most recent scrape ran for that state
//   - the status of that run
//   - when the next scrape is scheduled (parsed from the grouping's cron)
// =====================================================================

function buildCoverageView(activeStates, groupings, recentRuns) {
  // Map state → grouping
  const stateToGrouping = {}
  groupings.forEach(g => {
    (g.states || []).forEach(st => { stateToGrouping[st] = g })
  })

  // Map state → most recent run
  const lastByState = {}
  recentRuns.forEach(r => {
    if (!lastByState[r.state] || new Date(r.started_at) > new Date(lastByState[r.state].started_at)) {
      lastByState[r.state] = r
    }
  })

  return activeStates.map(state => {
    const grouping = stateToGrouping[state]
    const lastRun = lastByState[state]
    const nextLabel = grouping ? cronNextLabel(grouping.scrape_cron) : 'No grouping'

    return {
      state,
      groupingName:  grouping?.name || null,
      groupingSlug:  grouping?.slug || null,
      lastScrapeAt:  lastRun?.started_at || null,
      lastStatus:    lastRun?.status || null,
      nextLabel,
    }
  }).sort((a, b) => {
    // Sort by next-up: states whose grouping runs soonest first
    return (a.nextLabel || '').localeCompare(b.nextLabel || '')
  })
}

// =====================================================================
// cronNextLabel — given a 5-field cron string like "0 2 * * 6"
// (Saturday 02:00), returns a short human label like "Sat 2am" plus
// the next concrete date if it's within 7 days.
// We only support the cron forms our state_groupings actually use:
//   "M H * * D" where M is minute, H hour, D day-of-week (0-6, 0=Sun).
// =====================================================================

function cronNextLabel(cron) {
  if (!cron) return '—'
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 5) return cron
  const minute = parseInt(parts[0], 10)
  const hour   = parseInt(parts[1], 10)
  const dow    = parseInt(parts[4], 10)
  if (isNaN(minute) || isNaN(hour) || isNaN(dow)) return cron

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayName = dayNames[dow] || ''
  const hour12  = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  const ampm    = hour < 12 ? 'am' : 'pm'
  const minStr  = minute === 0 ? '' : `:${String(minute).padStart(2, '0')}`

  // Compute next concrete date
  const now = new Date()
  const next = new Date(now)
  // How many days until target dow (0..6); if it's today but past time, +7
  let delta = (dow - now.getDay() + 7) % 7
  next.setHours(hour, minute, 0, 0)
  if (delta === 0 && next <= now) delta = 7
  next.setDate(now.getDate() + delta)

  const daysAway = Math.floor((next - now) / (1000 * 60 * 60 * 24))
  const label = `${dayName} ${hour12}${minStr}${ampm}`
  if (daysAway === 0) return `Today ${hour12}${minStr}${ampm}`
  if (daysAway === 1) return `Tomorrow ${hour12}${minStr}${ampm}`
  return `${label} (in ${daysAway}d)`
}

// ────────────────────────────────────────────────────────────────────────────
// RUN HISTORY
// ────────────────────────────────────────────────────────────────────────────

function RunHistoryPage() {
  const { selectedOip } = useOip()
  const [runs, setRuns] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedOip) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const { data: r } = await supabase
        .from('scrape_runs')
        .select('id, state, status, docs_scraped, signals_emitted, started_at, finished_at, error_message')
        .eq('vertical_id', selectedOip.vertical_id)
        .order('started_at', { ascending: false })
        .limit(50)
      const { data: j } = await supabase
        .from('worker_jobs')
        .select('id, job_type, status, attempt, started_at, finished_at, error_message, stats')
        .or(`oip_id.eq.${selectedOip.id},vertical_id.eq.${selectedOip.vertical_id}`)
        .order('enqueued_at', { ascending: false })
        .limit(30)
      if (cancelled) return
      setRuns(r || []); setJobs(j || []); setLoading(false)
    })()
    return () => { cancelled = true }
  }, [selectedOip])

  if (loading) return <SectionLoader />
  return (
    <div className="detail-section">
      <div className="detail-eyebrow">Operations</div>
      <h2 className="detail-title">Run history</h2>
      <Block label="Recent scrape runs">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--rule)' }}>
            <th style={th}>Started</th><th style={th}>State</th><th style={th}>Status</th><th style={th}>Docs</th><th style={th}>Signals</th><th style={th}>Duration</th>
          </tr></thead>
          <tbody>
            {runs.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--rule)' }}>
                <td style={td}>{new Date(r.started_at).toLocaleString()}</td>
                <td style={td}>{r.state}</td>
                <td style={td}><RunStatusBadge status={r.status} /></td>
                <td style={td}>{r.docs_scraped ?? '—'}</td>
                <td style={td}>{r.signals_emitted ?? '—'}</td>
                <td style={td}>{r.finished_at ? Math.round((new Date(r.finished_at) - new Date(r.started_at)) / 1000) + 's' : '…'}</td>
              </tr>
            ))}
            {runs.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--ink-faint)' }}>No runs yet.</td></tr>}
          </tbody>
        </table>
      </Block>
      <Block label="Recent worker jobs">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--rule)' }}>
            <th style={th}>Type</th><th style={th}>Status</th><th style={th}>Attempt</th><th style={th}>Started</th><th style={th}>Stats</th>
          </tr></thead>
          <tbody>
            {jobs.map(j => (
              <tr key={j.id} style={{ borderBottom: '1px solid var(--rule)' }}>
                <td style={td}>{j.job_type}</td>
                <td style={td}><RunStatusBadge status={j.status} /></td>
                <td style={td}>{j.attempt}</td>
                <td style={td}>{j.started_at ? new Date(j.started_at).toLocaleString() : '—'}</td>
                <td style={td}>{j.stats ? Object.entries(j.stats).map(([k,v]) => `${k}:${v}`).join('  ') : '—'}</td>
              </tr>
            ))}
            {jobs.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--ink-faint)' }}>No jobs yet.</td></tr>}
          </tbody>
        </table>
      </Block>
    </div>
  )
}

function RunStatusBadge({ status }) {
  const colors = {
    success: { bg: '#dcf2e6', fg: '#0d5e44' },
    running: { bg: '#fff3a8', fg: '#875214' },
    failed: { bg: '#ffd6d6', fg: '#a01818' },
    failed_final: { bg: '#ffd6d6', fg: '#a01818' },
    skipped: { bg: '#eee', fg: '#666' },
    queued: { bg: '#e8efff', fg: '#2861d8' },
  }
  const c = colors[status] || { bg: '#eee', fg: '#666' }
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 3, fontSize: 11,
      fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '.06em',
      background: c.bg, color: c.fg,
    }}>{status}</span>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// ACCOUNT — change password
// ────────────────────────────────────────────────────────────────────────────

function AccountPage() {
  const { user } = useAuth()
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const validation = validatePassword(pw1)
  const matches = pw1 && pw1 === pw2

  const submit = async (e) => {
    e.preventDefault()
    if (!validation.valid) { setErr('Password does not meet requirements'); return }
    if (!matches) { setErr('Passwords do not match'); return }
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    setBusy(false)
    if (error) setErr(error.message)
    else { setDone(true); setPw1(''); setPw2(''); setTimeout(() => setDone(false), 3000) }
  }

  return (
    <div className="detail-section">
      <div className="detail-eyebrow">Account</div>
      <h2 className="detail-title">Your account</h2>
      <Block label="Email">{user.email}</Block>
      <Block label="User ID"><code>{user.id}</code></Block>
      <Block label="Change password">
        <form onSubmit={submit} style={{ maxWidth: 420 }}>
          <AuthField label="New password" type="password" value={pw1} onChange={setPw1} required />
          <AuthField label="Confirm password" type="password" value={pw2} onChange={setPw2} required />
          <PasswordRequirements value={pw1} />
          {err && <div className="auth-error">{err}</div>}
          {done && <div style={{ color: '#0d5e44', marginBottom: 16, fontSize: 14 }}>✓ Password updated.</div>}
          <button type="submit" disabled={busy || !validation.valid || !matches}
            style={{ padding: '10px 18px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 600 }}>
            {busy ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </Block>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// SHARED UI HELPERS
// ────────────────────────────────────────────────────────────────────────────

function SectionLoader() {
  return <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-fade)', fontFamily: "'IBM Plex Mono', monospace" }}>Loading…</div>
}

function EmptyMessage({ title, message }) {
  return (
    <div style={{ padding: '60px 20px', textAlign: 'center', background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 4 }}>
      <h3 style={{ fontFamily: "'Spectral', serif", fontSize: 20, marginBottom: 8 }}>{title}</h3>
      <p style={{ color: 'var(--ink-fade)' }}>{message}</p>
    </div>
  )
}

// =====================================================================
// HelpPage — renders the embedded USER_GUIDE markdown.
// Supports ?topic=foo URL param to scroll to a specific section.
// =====================================================================

function HelpPage() {
  const location = useLocation()
  const [topic, setTopic] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const t = params.get('topic')
    if (t && HELP_ANCHORS[t]) {
      setTopic(HELP_ANCHORS[t])
    }
  }, [location.search])

  // After render, scroll to the requested anchor
  useEffect(() => {
    if (!topic) return
    const el = document.getElementById(topic)
    if (el) {
      // Small delay so layout is stable
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [topic])

  return (
    <div className="detail-section help-page">
      <div className="detail-eyebrow">User Guide</div>
      <h2 className="detail-title">How to use the OIP</h2>
      <p className="detail-body" style={{ marginBottom: 32 }}>
        Comprehensive reference for everyone using this OIP — owners, admins, members, and viewers.
        Use the navigation links to jump to a section. The <strong>?</strong> icons throughout the app
        link directly to the relevant section here.
      </p>
      <Markdown text={USER_GUIDE} />
    </div>
  )
}

// Small inline help icon — placed next to a label, links to /help?topic=KEY
function HelpIcon({ topic }) {
  return (
    <Link to={`/help?topic=${topic}`} title="Open the user guide for this section"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 16, height: 16, borderRadius: '50%',
        background: 'var(--rule)', color: 'var(--ink-fade)',
        textDecoration: 'none',
        fontSize: 11, fontWeight: 600,
        fontFamily: "'IBM Plex Mono', monospace",
        marginLeft: 8, verticalAlign: 'middle',
        cursor: 'pointer',
      }}>?</Link>
  )
}

// =====================================================================
// Markdown — minimal renderer for our tightly-controlled guide content.
// Supports: # ## ### headings, paragraphs, bullet lists, numbered lists,
// blockquotes, tables, **bold**, *italic*, `code`, > blockquote.
// Doesn't handle: nested lists, fenced code blocks (none in our guide),
// raw HTML, images.
// =====================================================================

function Markdown({ text }) {
  const blocks = parseMarkdown(text)
  return <div className="md">{blocks.map((b, i) => renderBlock(b, i))}</div>
}

function parseMarkdown(text) {
  const lines = text.split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // Heading
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      blocks.push({ type: 'h', level: h[1].length, text: h[2] })
      i++; continue
    }
    // Blank line
    if (line.trim() === '') { i++; continue }
    // Blockquote (single or multiple lines)
    if (line.startsWith('> ')) {
      const quoteLines = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2))
        i++
      }
      blocks.push({ type: 'quote', text: quoteLines.join('\n') })
      continue
    }
    // Bullet list
    if (line.match(/^- /)) {
      const items = []
      while (i < lines.length && lines[i].match(/^- /)) {
        items.push(lines[i].slice(2))
        i++
      }
      blocks.push({ type: 'ul', items })
      continue
    }
    // Numbered list
    if (line.match(/^\d+\. /)) {
      const items = []
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(lines[i].replace(/^\d+\. /, ''))
        i++
      }
      blocks.push({ type: 'ol', items })
      continue
    }
    // Table (line starts with | and next line is separator)
    if (line.startsWith('|') && i + 1 < lines.length && lines[i + 1].match(/^\|[\s|:-]+\|$/)) {
      const headerCells = line.split('|').slice(1, -1).map(c => c.trim())
      const rows = []
      i += 2  // skip header + separator
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(lines[i].split('|').slice(1, -1).map(c => c.trim()))
        i++
      }
      blocks.push({ type: 'table', header: headerCells, rows })
      continue
    }
    // Paragraph (multi-line until blank)
    const paraLines = []
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].match(/^(#|\- |>|\d+\. |\|)/)) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length) blocks.push({ type: 'p', text: paraLines.join(' ') })
  }
  return blocks
}

function renderBlock(b, key) {
  switch (b.type) {
    case 'h': {
      const id = slugify(b.text)
      const HeadingTag = b.level === 1 ? 'h1' : b.level === 2 ? 'h2' : 'h3'
      const fontSize = b.level === 1 ? 30 : b.level === 2 ? 22 : 16
      return (
        <HeadingTag key={key} id={id}
          style={{
            fontFamily: "'Spectral', Georgia, serif",
            fontWeight: 600,
            fontSize,
            letterSpacing: b.level === 1 ? '-.6px' : '-.3px',
            color: 'var(--ink)',
            marginTop: b.level === 1 ? 0 : b.level === 2 ? 36 : 22,
            marginBottom: b.level === 1 ? 12 : 12,
            paddingBottom: b.level === 2 ? 6 : 0,
            borderBottom: b.level === 2 ? '1px solid var(--rule)' : 'none',
            scrollMarginTop: 100,  // so anchored scroll doesn't hide under topbar
          }}>
          {renderInline(b.text)}
        </HeadingTag>
      )
    }
    case 'p':
      return <p key={key} style={{ marginBottom: 14, lineHeight: 1.65, fontSize: 15, color: 'var(--ink-light)' }}>{renderInline(b.text)}</p>
    case 'ul':
      return (
        <ul key={key} style={{ marginBottom: 16, paddingLeft: 24, lineHeight: 1.7, fontSize: 15, color: 'var(--ink-light)' }}>
          {b.items.map((it, i) => <li key={i}>{renderInline(it)}</li>)}
        </ul>
      )
    case 'ol':
      return (
        <ol key={key} style={{ marginBottom: 16, paddingLeft: 24, lineHeight: 1.7, fontSize: 15, color: 'var(--ink-light)' }}>
          {b.items.map((it, i) => <li key={i}>{renderInline(it)}</li>)}
        </ol>
      )
    case 'quote':
      return (
        <blockquote key={key} style={{
          margin: '20px 0',
          padding: '14px 18px',
          background: 'var(--bg)',
          borderLeft: '3px solid var(--primary)',
          fontStyle: 'italic',
          fontSize: 14,
          color: 'var(--ink-fade)',
          lineHeight: 1.65,
          whiteSpace: 'pre-wrap',
        }}>
          {renderInline(b.text)}
        </blockquote>
      )
    case 'table':
      return (
        <div key={key} style={{ overflowX: 'auto', marginBottom: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                {b.header.map((c, i) => (
                  <th key={i} style={{
                    padding: '10px 14px', textAlign: 'left',
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '.1em',
                    color: 'var(--ink-fade)', whiteSpace: 'nowrap',
                  }}>{renderInline(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, ri) => (
                <tr key={ri} style={{ borderBottom: '1px solid var(--rule)' }}>
                  {row.map((c, ci) => (
                    <td key={ci} style={{ padding: '10px 14px' }}>{renderInline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    default:
      return null
  }
}

// Inline formatting: **bold**, *italic*, `code`
function renderInline(text) {
  if (!text) return text
  // Tokenize by markers
  const parts = []
  let i = 0
  let buf = ''
  const flush = () => { if (buf) { parts.push(buf); buf = '' } }
  while (i < text.length) {
    if (text[i] === '*' && text[i+1] === '*') {
      // bold
      flush()
      const end = text.indexOf('**', i + 2)
      if (end === -1) { buf += text[i]; i++; continue }
      parts.push({ kind: 'b', text: text.slice(i + 2, end) })
      i = end + 2
    } else if (text[i] === '*') {
      flush()
      const end = text.indexOf('*', i + 1)
      if (end === -1) { buf += text[i]; i++; continue }
      parts.push({ kind: 'i', text: text.slice(i + 1, end) })
      i = end + 1
    } else if (text[i] === '`') {
      flush()
      const end = text.indexOf('`', i + 1)
      if (end === -1) { buf += text[i]; i++; continue }
      parts.push({ kind: 'code', text: text.slice(i + 1, end) })
      i = end + 1
    } else {
      buf += text[i]
      i++
    }
  }
  flush()
  return parts.map((p, idx) => {
    if (typeof p === 'string') return <span key={idx}>{p}</span>
    if (p.kind === 'b') return <strong key={idx}>{p.text}</strong>
    if (p.kind === 'i') return <em key={idx}>{p.text}</em>
    if (p.kind === 'code') return <code key={idx} style={{
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '0.9em',
      background: 'var(--bg)',
      padding: '1px 6px',
      borderRadius: 2,
      border: '1px solid var(--rule)',
    }}>{p.text}</code>
    return null
  })
}

function slugify(s) {
  return s.toLowerCase()
    .replace(/&/g, 'and')
    .replace(/—/g, '-')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}
