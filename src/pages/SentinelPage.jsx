// Sentinel page — keyword editor with version save + re-score, keyword
// analytics, and the SAM department picker it uses.
// Extracted from App.jsx — no behavior change.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useOip } from '../lib/oip'
import { Block, SectionLoader, HelpIcon } from '../components/ui/shared'

// Table cell styles — same values as the th/td consts in App.jsx.
const th = { padding: '10px 12px', fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--ink-fade)' }
const td = { padding: '12px', fontSize: 14 }

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

// ────────────────────────────────────────────────────────────────────────────
// SENTINEL — keyword editor with version save + re-score
// ────────────────────────────────────────────────────────────────────────────

export default function SentinelPage() {
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
    // Mirror the keyword list into pull_config.keyword_searches so the SCRAPE
    // stage (which reads pull_config.keyword_searches) collects the same terms
    // the SCORE stage tiers via sentinel_keywords. Watchlist terms score but do
    // NOT drive collection, so they are excluded from the pull list.
    const kwList = [...new Set(
      (draft || [])
        .filter(k => !k.is_watchlist)
        .map(k => (k.keyword || '').toLowerCase().trim())
        .filter(Boolean)
    )]
    const mergedPull = { ...pullConfig, keyword_searches: kwList }
      const { data: ns, error: nsErr } = await supabase.from('sentinels').insert({
      oip_id: selectedOip.id,
      version: newVersion,
      is_active: true,
      status: 'active',
      mode: sentinel.mode,
      match_fields: sentinel.match_fields,
      groups: sentinel.groups,
      name: sentinelName,
      pull_config: mergedPull,
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
              {pullConfig.keyword_searches?.length > 0 && (
                <div><span style={{ color: 'var(--ink-fade)', marginRight: 12 }}>Keywords</span>{pullConfig.keyword_searches.join(', ')}</div>
              )}
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
