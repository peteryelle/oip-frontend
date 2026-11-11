// Top-of-page chrome: desktop Topbar (brand, OIP switcher, run stamp, user
// menu) plus the phone header/menu sheet and bottom tab bar.
// Extracted from App.jsx — no behavior change.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'

// ────────────────────────────────────────────────────────────────────────────
// TOPBAR — brand, OIP switcher, run stamp, user menu
// ────────────────────────────────────────────────────────────────────────────

// On OIP change, always drop the user on Market Review, for every lane.
// Shared by the desktop Topbar and the phone MobileTopbar.
function oipLandingPath(_oip) {
  return '/market'
}

// Run-stamp dates are always shown in Eastern time (the schedule is defined
// in ET and timestamps are stored UTC), regardless of the viewer's timezone.
function formatDateET(dateStr, opts) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('en-US', { timeZone: 'America/New_York', ...opts })
}

export function Topbar({ onSignOut, userEmail, oips = [], selectedOipId, onSelectOip, latestRun }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()
  const selectedOip = oips.find(o => o.id === selectedOipId)
  const tenantName = selectedOip?.tenants?.name || ''
  const oipName = selectedOip?.name || ''
  const landingFor = oipLandingPath
  // Recompete Direct placeholder: shown in the selector when the tenant has
  // no -recompete OIP, so every customer sees the service.
  const location = useLocation()
  const RECOMPETE_PLACEHOLDER = '__recompete_direct__'
  const hasRecompete = oips.some(o =>
    o.slug?.endsWith('-recompete') && o.tenant_id === selectedOip?.tenant_id)
  const showRecompetePlaceholder = !!selectedOip && !hasRecompete
  const onRecompetePlaceholder = showRecompetePlaceholder && location.pathname.startsWith('/radar')
  const handleSelectOip = (id) => {
    if (id === RECOMPETE_PLACEHOLDER) { navigate('/radar'); return }
    onSelectOip(id)
    navigate(landingFor(oips.find(o => o.id === id)))
  }

  // Run stamp: "Active · Last updated Fri, Nov 7 · Next Sat, Nov 14"
  const stampOpts = { weekday: 'short', month: 'short', day: 'numeric' }
  const lastUpdatedStr = formatDateET(latestRun?.finished_at, stampOpts)
  const nextUpdateStr = formatDateET(latestRun?.next_update, stampOpts)
  const showStamp = latestRun?.status === 'active'

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-stack">
          <Link to="/" className="brand-mark" style={{ textDecoration: 'none' }}>
            <span className="dot"></span>WinQuest OIP: Opportunity Intelligence Platform
          </Link>
          <div className="brand-customer">
            <span className="blurable">{tenantName}</span>
            {(oips.length > 1 || showRecompetePlaceholder) ? (
              <select
                value={onRecompetePlaceholder ? RECOMPETE_PLACEHOLDER : (selectedOipId || '')}
                onChange={e => handleSelectOip(e.target.value)}
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
                {(() => {
                  const ungrouped = oips.filter(o => !o.derivation_grade)
                  const rich = oips.filter(o => o.derivation_grade === 'rich')
                  const aggregation = oips.filter(o => o.derivation_grade === 'aggregation')
                  return (
                    <>
                      {ungrouped.map(o => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                      {rich.length > 0 && (
                        <optgroup label="Derived — Rich">
                          {rich.map(o => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                          ))}
                        </optgroup>
                      )}
                      {aggregation.length > 0 && (
                        <optgroup label="Derived — Aggregation">
                          {aggregation.map(o => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                          ))}
                        </optgroup>
                      )}
                      {showRecompetePlaceholder && (
                        <option value={RECOMPETE_PLACEHOLDER}>Recompete Direct</option>
                      )}
                    </>
                  )
                })()}
              </select>
            ) : (
              oipName ? <span style={{ marginLeft: 8, color: 'var(--ink-fade)' }}>· {oipName}</span> : null
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {showStamp && (
          <div className="run-stamp">
            Active · {lastUpdatedStr ? `Last updated ${lastUpdatedStr}` : 'Not yet updated'}
            {nextUpdateStr && ` · Next ${nextUpdateStr}`}
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

// ────────────────────────────────────────────────────────────────────────────
// PHONE CHROME (<=768px) — compact header + menu sheet, bottom tab bar.
// Both render on every screen size; global.css shows them only on phones and
// hides the desktop Topbar, section nav, breadcrumb and floating ? there.
// ────────────────────────────────────────────────────────────────────────────

export function MobileTopbar({ onSignOut, userEmail = '', oips = [], selectedOipId, onSelectOip, latestRun }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const selectedOip = oips.find(o => o.id === selectedOipId)
  const tenantName = selectedOip?.tenants?.name || 'WinQuest'
  const hasChoice = oips.length > 1

  // Close the menu on navigation and on Escape.
  useEffect(() => { setOpen(false) }, [location.pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const go = (to) => { setOpen(false); navigate(to) }
  const openHelp = () => {
    setOpen(false)
    window.dispatchEvent(new CustomEvent('open-help', { detail: { prefill: '' } }))
  }
  const shortOpts = { month: 'short', day: 'numeric' }
  const lastRunStr = formatDateET(latestRun?.finished_at, shortOpts)
  const nextRunStr = formatDateET(latestRun?.next_update, shortOpts)
  const showStamp = latestRun?.status === 'active'

  return (
    <>
      <header className="mobile-topbar">
        <Link to="/" className="mt-brand" aria-label="Home">
          <span className="mt-dot" aria-hidden="true"></span>
          <span className="mt-names">
            <span className="mt-tenant blurable">{tenantName}</span>
            {hasChoice && selectedOip?.name && (
              <span className="mt-oip blurable">{selectedOip.name}</span>
            )}
          </span>
        </Link>
        <button type="button" className="mt-menu-btn"
          aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}
          onClick={() => setOpen(o => !o)}>
          {open ? (
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          )}
        </button>
      </header>

      {open && (
        <div className="mt-sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="mt-sheet" role="dialog" aria-label="Menu" onClick={e => e.stopPropagation()}>
            {hasChoice && onSelectOip && (
              <label className="mt-field">
                <span className="mt-field-label">Viewing</span>
                <select value={selectedOipId || ''}
                  onChange={e => {
                    const id = e.target.value
                    onSelectOip(id)
                    go(oipLandingPath(oips.find(o => o.id === id)))
                  }}>
                  {oips.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
            )}
            <nav className="mt-links">
              <button type="button" onClick={() => go('/profile')}>Setup</button>
              <button type="button" onClick={() => go('/radar')}>Recompete Direct</button>
              <button type="button" onClick={() => go('/help')}>User Guide</button>
              <button type="button" onClick={openHelp}>Help &amp; requests</button>
              <button type="button" onClick={() => go('/account')}>Account &amp; password</button>
              <button type="button" onClick={() => go('/settings')}>Settings</button>
              {onSignOut && (
                <button type="button" onClick={() => { setOpen(false); onSignOut() }}>Sign out</button>
              )}
            </nav>
            <div className="mt-sheet-foot">
              <span>{userEmail}</span>
              {showStamp && (
                <span>
                  Active · {lastRunStr ? `Updated ${lastRunStr}` : 'Not yet updated'}
                  {nextRunStr && ` · Next ${nextRunStr}`}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const TAB_ICONS = {
  home:    <path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />,
  market:  <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>,
  pursued: <path d="M7 4h10v16l-5-4-5 4z" />,
  weekly:  <><rect x="4" y="5" width="16" height="15" rx="1.5" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
}

export function MobileTabBar({ activeSection, selectedOip }) {
  const slug = selectedOip?.slug || ''
  // Second tab follows the selected lane's results page.
  const results = slug.endsWith('-derived')   ? { to: '/demand', key: 'demand', label: 'Derived' }
                : slug.endsWith('-recompete') ? { to: '/radar',  key: 'radar',  label: 'Recompete' }
                : { to: '/market', key: 'market', label: 'Market' }
  const tabs = [
    { to: '/',        key: 'home',    label: 'Dashboard', icon: 'home' },
    { ...results,                                          icon: 'market' },
    { to: '/pursued', key: 'pursued', label: 'Pursued',   icon: 'pursued' },
    { to: '/weekly',  key: 'weekly',  label: 'Weekly',    icon: 'weekly' },
  ]
  return (
    <nav className="mobile-tabbar" aria-label="Sections">
      {tabs.map(t => (
        <Link key={t.key} to={t.to}
          className={`mtb-item${activeSection === t.key ? ' active' : ''}`}
          aria-current={activeSection === t.key ? 'page' : undefined}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {TAB_ICONS[t.icon]}
          </svg>
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
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
