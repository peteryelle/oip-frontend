// Profile page — view + edit. Carved out of App.jsx unchanged (Nov 2026) so
// new Profile sections land in a small file instead of the monolith.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useOip } from '../lib/oip'
import { exportElementPdf } from '../lib/briefPdf'
import { Block, SectionLoader, HelpIcon } from '../components/ui/shared'
import CompetitorsBlock from '../components/profile/CompetitorsBlock'

// ────────────────────────────────────────────────────────────────────────────
// PROFILE — view + edit
// ────────────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { selectedOip } = useOip()
  const [profile, setProfile] = useState(null)
  const [activeStates, setActiveStates] = useState([])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [versions, setVersions] = useState([])
  const [borrowed, setBorrowed] = useState(false) // profile resolved from tenant-canonical (no per-OIP row)
  const { memberships } = useAuth()
  const myRole = memberships.find(m => m.tenant_id === selectedOip?.tenant_id)?.role
  const canEdit = ['owner', 'admin'].includes(myRole) && !borrowed
  // Competitors write straight to the tenant-canonical row, so owners/admins
  // can edit them even where the rest of the profile is borrowed (read-only).
  const canEditCompetitors = ['owner', 'admin'].includes(myRole)
  const isSam = selectedOip?.verticals?.slug === 'sam'
  const profileRef = useRef(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const exportProfilePdf = async () => {
    setExportingPdf(true)
    try {
      const name = profile?.data?.name || selectedOip?.tenants?.name || 'profile'
      await exportElementPdf(profileRef.current, `${name} profile`)
    } catch (e) { console.error('PDF export failed', e); alert('PDF export failed. Please try again.') }
    finally { setExportingPdf(false) }
  }

  const loadProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, version, is_active, is_tenant_canonical, data, created_at')
      .eq('oip_id', selectedOip.id)
      .order('version', { ascending: false })
    if (data && data.length) {
      setVersions(data)
      setProfile(data.find(p => p.is_active) || data[0])
      setBorrowed(false)
    } else {
      // Recompete/Derived lanes have no per-OIP profile row — fall back to the
      // tenant-canonical profile (read-only) so Profile renders in every lane.
      const { data: canon } = await supabase.rpc('get_canonical_profile_row', { p_oip_id: selectedOip.id })
      if (canon) {
        setVersions([])
        setProfile({ id: canon.id, version: null, is_active: true, data: canon.data })
        setBorrowed(true)
      }
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
    // The worker reads the TENANT-CANONICAL row (get_canonical_profile_row),
    // not the active one. If the row being replaced is canonical, the flag
    // must move to the new version — otherwise the worker keeps reading the
    // old, now-inactive row and never sees this edit. Clear first, then
    // insert, so there is never more than one canonical row per tenant.
    const wasCanonical = !!profile.is_tenant_canonical
    if (wasCanonical) {
      const { error: canonErr } = await supabase
        .from('profiles')
        .update({ is_tenant_canonical: false })
        .eq('id', profile.id)
      if (canonErr) { alert(canonErr.message); setSaving(false); return }
    }
    // Deactivate all profiles for this OIP, then insert+activate the new one
    const { error: deactErr } = await supabase
      .from('profiles')
      .update({ is_active: false })
      .eq('oip_id', selectedOip.id)
    if (deactErr) {
      if (wasCanonical) {
        await supabase.from('profiles').update({ is_tenant_canonical: true }).eq('id', profile.id)
      }
      alert(deactErr.message); setSaving(false); return
    }

    const { error: insErr } = await supabase
      .from('profiles')
      .insert({
        oip_id: selectedOip.id,
        tenant_id: selectedOip.tenant_id,
        version: newVersion,
        is_active: true,
        is_tenant_canonical: wasCanonical,
        data: draft,
      })
    setSaving(false)
    if (insErr) {
      // Put the canonical flag back on the old row so the worker still has one.
      if (wasCanonical) {
        await supabase.from('profiles').update({ is_tenant_canonical: true }).eq('id', profile.id)
      }
      alert(insErr.message)
      return
    }
    await loadProfile()
    setEditing(false)
  }

  if (!profile) return <SectionLoader />

  const data = editing ? draft : profile.data

  return (
    <div className="detail-section" ref={profileRef}>
      {!editing && (
        <button data-pdf-exclude onClick={exportProfilePdf} disabled={exportingPdf} style={{
          float: 'right', padding: '5px 12px', borderRadius: 4,
          border: '1px solid var(--rule-strong, #cbd5e1)', background: 'var(--paper)', cursor: exportingPdf ? 'wait' : 'pointer',
          fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--primary)',
        }}>{exportingPdf ? 'Preparing PDF…' : 'Export PDF'}</button>
      )}
      <div className="detail-eyebrow">Profile · {borrowed ? 'tenant profile (read-only)' : `v${profile.version} ${profile.is_active ? '(active)' : ''}`}</div>
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
      {!editing && <CompetitorsBlock oipId={selectedOip.id} canEdit={canEditCompetitors} />}

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

      {/* ── COMMERCIAL CUSTOMERS (drives Derived Demand agency twins) ── */}
      {(data.customers?.length > 0 || editing) && (
        <Block label="Commercial customers">
          {editing ? (
            <>
              <textarea
                value={(draft.customers || [])
                  .map(c => typeof c === 'string'
                    ? c
                    : [c.name, c.sector].filter(Boolean).join(' — '))
                  .join('\n')}
                onChange={e => {
                  const parsed = e.target.value
                    .split('\n')
                    .map(line => line.trim())
                    .filter(Boolean)
                    .map(line => {
                      const parts = line.split(/\s+[—-]\s+/)
                      const name = (parts[0] || '').trim()
                      const sector = (parts[1] || '').trim()
                      return sector ? { name, sector } : { name }
                    })
                  setDraft({ ...draft, customers: parsed })
                }}
                className="form-textarea" rows={6}
                placeholder={"One customer per line, e.g.\nArrow Energy — Energy / Oil & Gas\nUS Bank — Financial Services\nState of Georgia DIT — State Government"}
              />
              <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--ink-fade)', fontStyle: 'italic' }}>
                One customer per line. Add an optional sector after a dash. Derived Demand maps these to their federal agency twins.
              </p>
            </>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
              {(data.customers || []).map((c, i) => (
                <li key={i}>{typeof c === 'string' ? c : [c.name, c.sector].filter(Boolean).join(' — ')}</li>
              ))}
            </ul>
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
