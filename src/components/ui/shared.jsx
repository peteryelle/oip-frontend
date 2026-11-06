// Small UI primitives shared across pages. Moved out of App.jsx unchanged
// so pages split into their own files (ProfilePage, ...) can import them.
import { Link } from 'react-router-dom'

export function Block({ label, children }) {
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

export function SectionLoader() {
  return <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-fade)', fontFamily: "'IBM Plex Mono', monospace" }}>Loading…</div>
}

export function HelpIcon({ topic }) {
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
