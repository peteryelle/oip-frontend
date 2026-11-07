// Competitors — the vendors this tenant loses deals to, plus the terms the
// market uses for the category. The DD v2 brief handler uses both to find
// out how each prime buys this capability (reverse lookup on these vendors'
// sites + a footprint search), so this list directly shapes Derived Demand
// scoring.
//
// Self-contained: always reads and writes the TENANT-CANONICAL profile row
// (get_canonical_profile_row), because that is the row the worker reads —
// including in Derived/Recompete lanes where the rest of the Profile page is
// borrowed and read-only. Saves merge only these keys into that row's data;
// nothing else in the profile is touched and no new version is created.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Block } from '../ui/shared'

const emptyRow = () => ({ name: '', domain: '', basis: '', source: 'manual' })

function cleanDomain(d) {
  return (d || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
}

export default function CompetitorsBlock({ oipId, canEdit }) {
  const [rowId, setRowId] = useState(null)
  const [comps, setComps] = useState([])
  const [terms, setTerms] = useState([])
  const [updatedAt, setUpdatedAt] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState([])
  const [draftTerms, setDraftTerms] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = async () => {
    const { data: canon } = await supabase.rpc('get_canonical_profile_row', { p_oip_id: oipId })
    const row = Array.isArray(canon) ? canon[0] : canon
    setRowId(row?.id || null)
    const d = row?.data || {}
    setComps(Array.isArray(d.competitors) ? d.competitors : [])
    setTerms(Array.isArray(d.capability_terms) ? d.capability_terms : [])
    setUpdatedAt(d.competitors_updated_at || d.competitors_seeded_at || null)
    setLoaded(true)
  }

  useEffect(() => { if (oipId) load() }, [oipId])

  const startEdit = () => {
    setDraft(comps.length ? comps.map(c => ({ ...emptyRow(), ...c })) : [emptyRow()])
    setDraftTerms(terms.join(', '))
    setEditing(true)
  }

  const setField = (i, k, v) => setDraft(draft.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const confirm = (i) => setDraft(draft.map((r, j) => (j === i ? { ...r, source: 'manual' } : r)))
  const remove = (i) => setDraft(draft.filter((_, j) => j !== i))

  const save = async () => {
    if (!rowId) return
    setSaving(true)
    // Read-modify-write on the freshest copy so a concurrent worker write to
    // other keys (or another editor) is not overwritten.
    const { data: fresh, error: readErr } = await supabase
      .from('profiles').select('data').eq('id', rowId).single()
    if (readErr) { alert(readErr.message); setSaving(false); return }
    const competitors = draft
      .map(r => ({ ...r, name: (r.name || '').trim(), domain: cleanDomain(r.domain) || null,
                   basis: (r.basis || '').trim() || null }))
      .filter(r => r.name)
    const capability_terms = draftTerms.split(',').map(t => t.trim()).filter(Boolean)
    const data = {
      ...(fresh?.data || {}),
      competitors,
      capability_terms,
      competitors_updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('profiles').update({ data }).eq('id', rowId)
    setSaving(false)
    if (error) { alert('Save failed: ' + error.message); return }
    setEditing(false)
    load()
  }

  if (!loaded || !rowId) return null
  if (!editing && comps.length === 0 && !canEdit) return null

  const suggested = comps.filter(c => c.source === 'auto_seeded').length

  return (
    <Block label="Competitors">
      <p style={{ fontSize: 13, color: 'var(--ink-fade)', margin: '0 0 10px' }}>
        The vendors you lose deals to. Derived Demand checks their websites for case studies and
        partner pages naming each prime, to show which primes already buy what you sell.
        {updatedAt && <> Last updated {new Date(updatedAt).toLocaleDateString()}.</>}
      </p>

      {!editing ? (
        <>
          {comps.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--ink-light)' }}>
              No competitors yet. Add them, or a suggested list is created on the next Derived Demand run.
            </p>
          ) : (
            <table className="wq-comp-table">
              <tbody>
                {comps.map((c, i) => (
                  <tr key={i}>
                    <td className="wq-comp-name">
                      {c.name}
                      {c.source === 'auto_seeded' && <span className="wq-comp-suggested">suggested</span>}
                    </td>
                    <td className="wq-comp-domain">
                      {c.domain
                        ? <a href={`https://${c.domain}`} target="_blank" rel="noreferrer">{c.domain}</a>
                        : <span style={{ color: 'var(--ink-fade)' }}>no domain</span>}
                    </td>
                    <td className="wq-comp-basis">{c.basis || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {terms.length > 0 && (
            <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 10 }}>
              <strong>Category terms:</strong> {terms.join(' · ')}
            </p>
          )}
          {suggested > 0 && (
            <p style={{ fontSize: 13, color: '#92400e', marginTop: 6 }}>
              {suggested} suggested {suggested === 1 ? 'competitor was' : 'competitors were'} found automatically — review and confirm.
            </p>
          )}
          {canEdit && (
            <button onClick={startEdit} className="wq-comp-btn">Edit competitors →</button>
          )}
        </>
      ) : (
        <>
          <table className="wq-comp-table wq-comp-edit">
            <thead>
              <tr><th>Company</th><th>Website</th><th>Why they compete</th><th /></tr>
            </thead>
            <tbody>
              {draft.map((r, i) => (
                <tr key={i}>
                  <td><input value={r.name} onChange={e => setField(i, 'name', e.target.value)} placeholder="Company" /></td>
                  <td><input value={r.domain || ''} onChange={e => setField(i, 'domain', e.target.value)} placeholder="example.com" /></td>
                  <td><input value={r.basis || ''} onChange={e => setField(i, 'basis', e.target.value)} placeholder="One line" /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.source === 'auto_seeded' && (
                      <button className="wq-comp-mini" onClick={() => confirm(i)} title="Keep this suggested competitor">Confirm</button>
                    )}
                    <button className="wq-comp-mini" onClick={() => remove(i)} title="Remove">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="wq-comp-mini" style={{ marginTop: 8 }} onClick={() => setDraft([...draft, emptyRow()])}>+ Add competitor</button>
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 13, color: 'var(--ink-light)', display: 'block', marginBottom: 4 }}>
              Category terms (comma-separated — how a buyer or job post would name what you sell; first three matter most)
            </label>
            <input className="wq-comp-terms" value={draftTerms} onChange={e => setDraftTerms(e.target.value)} />
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-fade)', marginTop: 10 }}>
            Saving re-checks every prime against the new list on the next Derived Demand run.
          </p>
          <div style={{ marginTop: 10 }}>
            <button onClick={save} disabled={saving}
              style={{ padding: '8px 16px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 600 }}>
              {saving ? 'Saving…' : 'Save competitors'}
            </button>
            <button onClick={() => setEditing(false)}
              style={{ marginLeft: 10, padding: '8px 16px', background: 'none', color: 'var(--ink-fade)', border: '1px solid var(--rule-strong)', borderRadius: 3, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </>
      )}

      <style>{`
        .wq-comp-table { width: 100%; border-collapse: collapse; font-size: 14px; }
        .wq-comp-table td, .wq-comp-table th { padding: 6px 8px; border-bottom: 1px solid var(--rule, #e5e7eb); text-align: left; vertical-align: top; }
        .wq-comp-table th { font-size: 12px; color: var(--ink-fade); font-weight: 600; }
        .wq-comp-name { font-weight: 600; white-space: nowrap; }
        .wq-comp-domain a { color: #2563eb; text-decoration: none; }
        .wq-comp-basis { color: var(--ink-light); }
        .wq-comp-suggested { margin-left: 8px; font-size: 11px; font-weight: 600; color: #92400e; background: #fef3c7; padding: 1px 6px; border-radius: 3px; }
        .wq-comp-edit input, .wq-comp-terms { width: 100%; padding: 6px 8px; border: 1px solid var(--rule-strong, #cbd5e1); border-radius: 3px; font: inherit; font-size: 13px; box-sizing: border-box; }
        .wq-comp-btn { margin-top: 10px; background: none; border: none; color: var(--primary); cursor: pointer; font: inherit; font-weight: 600; padding: 0; }
        .wq-comp-mini { margin-left: 4px; padding: 3px 8px; font-size: 12px; background: var(--paper, #fff); border: 1px solid var(--rule-strong, #cbd5e1); border-radius: 3px; cursor: pointer; }
      `}</style>
    </Block>
  )
}
