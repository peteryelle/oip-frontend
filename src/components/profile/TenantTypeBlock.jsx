// "What you sell" — product, service or media seller. Sits at the top of the
// Profile page. When it is unset this block becomes the banner the login gate
// (TenantTypeGate) sends owners and admins to.
//
// Self-contained like CompetitorsBlock: reads and writes the tenant-canonical
// profile row via lib/tenantType, so it works in every lane, including
// Derived/Recompete where the rest of the Profile page is read-only.
import { useEffect, useState } from 'react'
import { Block } from '../ui/shared'
import { TENANT_TYPES, loadTenantType, saveTenantType, tenantTypeLabel } from '../../lib/tenantType'

const bannerStyle = {
  border: '1px solid #f59e0b', background: '#fffbeb', color: '#78350f',
  borderRadius: 6, padding: '14px 16px', margin: '0 0 18px',
}

export default function TenantTypeBlock({ oipId, canEdit, onSaved }) {
  const [rowId, setRowId] = useState(null)
  const [value, setValue] = useState(null)
  const [choice, setChoice] = useState(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)

  const load = async () => {
    try {
      const r = await loadTenantType(oipId)
      setRowId(r.rowId)
      setValue(r.value)
      setChoice(r.value)
    } catch (e) {
      setError(e.message || 'Could not load company type.')
    }
    setLoaded(true)
  }

  useEffect(() => { if (oipId) load() }, [oipId])

  const save = async () => {
    if (!choice) return
    setSaving(true)
    setError(null)
    try {
      await saveTenantType(rowId, choice)
      setValue(choice)
      setEditing(false)
      if (onSaved) onSaved()
    } catch (e) {
      setError('Save failed: ' + (e.message || 'unknown error'))
    }
    setSaving(false)
  }

  if (!loaded || !rowId) return null

  const unset = !value
  const showPicker = canEdit && (unset || editing)

  const picker = (
    <div role="radiogroup" aria-label="What your company sells" style={{ display: 'grid', gap: 8, margin: '6px 0 12px' }}>
      {TENANT_TYPES.map(t => (
        <label key={t.value} style={{
          display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
          padding: '10px 12px', borderRadius: 6, background: 'var(--paper, #fff)',
          border: `1px solid ${choice === t.value ? 'var(--primary, #1e40af)' : 'var(--rule-strong, #cbd5e1)'}`,
        }}>
          <input
            type="radio" name="tenant_type" value={t.value}
            checked={choice === t.value} onChange={() => setChoice(t.value)}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong style={{ display: 'block', color: 'var(--ink)' }}>{t.label}</strong>
            <span style={{ fontSize: 13, color: 'var(--ink-light)' }}>{t.definition}</span>
          </span>
        </label>
      ))}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={save} disabled={!choice || saving} className="wq-comp-btn" style={{ marginTop: 0 }}>
          {saving ? 'Saving…' : 'Save company type'}
        </button>
        {editing && !unset && (
          <button onClick={() => { setEditing(false); setChoice(value) }} className="wq-comp-btn"
            style={{ marginTop: 0, background: 'none', color: 'var(--ink-light)' }}>
            Cancel
          </button>
        )}
      </div>
      {error && <div style={{ fontSize: 13, color: '#b91c1c' }}>{error}</div>}
    </div>
  )

  if (unset) {
    return (
      <div id="tenant-type" style={bannerStyle}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
          Set your company type to continue
        </div>
        <div style={{ fontSize: 14, marginBottom: 8 }}>
          Tell us what your company sells. Derived Demand uses this to decide which public evidence
          shows a prime already buying what you offer, and how to rank each opportunity.
        </div>
        {canEdit ? picker : (
          <div style={{ fontSize: 14 }}>
            Someone on your team needs to set this. Ask them to open Setup → Profile.
          </div>
        )}
      </div>
    )
  }

  return (
    <Block label="Company type">
      <div id="tenant-type">
        {!showPicker ? (
          <>
            <p style={{ fontSize: 14, margin: '0 0 4px', color: 'var(--ink)' }}>
              <strong>{tenantTypeLabel(value)}</strong>
              {' — '}{TENANT_TYPES.find(t => t.value === value)?.definition}
            </p>
            <p style={{ fontSize: 13, color: 'var(--ink-fade)', margin: '0 0 8px' }}>
              Derived Demand uses this to judge which primes already buy what you offer.
            </p>
            {canEdit && (
              <button onClick={() => setEditing(true)} className="wq-comp-btn">Change company type →</button>
            )}
          </>
        ) : picker}
      </div>
    </Block>
  )
}
