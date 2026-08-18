import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN DASHBOARD — cross-tenant owner view. Gated server-side by the
// admin-dashboard-data Edge Function checking platform_admins; there is
// no client-side admin check by design (platform_admins has RLS enabled
// with zero policies, so it can't be queried directly from the browser
// at all -- attempting the fetch and handling a 403 IS the UI gate).
// ─────────────────────────────────────────────────────────────────────────────

function scoreBucketPct(buckets, entityCount) {
  if (!entityCount) return null
  const keys = ['b_0_39', 'b_40_49', 'b_50_59', 'b_60_69', 'b_70_79', 'b_80_100']
  return keys.map(k => Math.round((buckets[k] / entityCount) * 100))
}

// Explicit America/New_York formatting -- correctly handles EST/EDT
// across the DST boundary, unlike relying on the browser's implicit
// local timezone (which would be wrong for anyone viewing this from
// outside ET, and ambiguous even for Peter since the underlying
// timestamps are stored UTC-normalized in the database).
function formatDateET(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('en-US', { timeZone: 'America/New_York' })
}
function formatTimeET(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleTimeString('en-US', { timeZone: 'America/New_York' }) + ' ET'
}
function formatDateTimeET(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET'
}
// Elapsed duration between start and (finish, or "now" while still running).
function formatElapsed(startedAt, finishedAt, now) {
  if (!startedAt) return '—'
  const start = new Date(startedAt)
  const end = finishedAt ? new Date(finishedAt) : now
  const totalSec = Math.max(0, Math.floor((end - start) / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const parts = []
  if (h) parts.push(`${h}h`)
  if (h || m) parts.push(`${m}m`)
  parts.push(`${s}s`)
  return parts.join(' ')
}

function ScoreDistributionBar({ oip }) {
  if (oip.scoring_model !== 'profile_fit') {
    return <span style={{ fontSize: 12, color: 'var(--text-muted, #999)' }}>different scoring model</span>
  }
  if (!oip.entity_count) {
    return <span style={{ fontSize: 12, color: 'var(--text-muted, #999)' }}>no entities scored yet</span>
  }
  const pcts = scoreBucketPct(oip.score_buckets, oip.entity_count)
  const colors = ['var(--fill-danger, #E24B4A)', 'var(--fill-danger, #E24B4A)',
    'var(--fill-warning, #EF9F27)', 'var(--fill-warning, #EF9F27)',
    'var(--fill-success, #639922)', 'var(--fill-success, #639922)']
  return (
    <div>
      <div style={{ display: 'flex', height: 12, borderRadius: 3, overflow: 'hidden', marginBottom: 2, minWidth: 140 }}>
        {pcts.map((p, i) => p > 0 && (
          <div key={i} style={{ width: `${p}%`, background: colors[i] }}
            title={`${['0-39','40-49','50-59','60-69','70-79','80-100'][i]}: ${p}%`} />
        ))}
      </div>
      <div style={{ fontSize: 10, color: 'var(--ink-fade, #999)' }}>
        {oip.score_min}&ndash;{oip.score_max} &middot; {oip.entity_count} entities
      </div>
    </div>
  )
}

export default function AdminDashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorType, setErrorType] = useState(null) // 'forbidden' | 'error' | null
  const [showInactive, setShowInactive] = useState(false)
  const [now, setNow] = useState(() => new Date())

  // Tick every second so the "elapsed" column updates live for running jobs.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setErrorType(null)
      const { data: result, error } = await supabase.functions.invoke('admin-dashboard-data')
      if (cancelled) return
      if (error) {
        const status = error?.context?.status
        setErrorType(status === 401 || status === 403 ? 'forbidden' : 'error')
        setLoading(false)
        return
      }
      setData(result)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--ink-fade, #999)' }}>Loading admin dashboard…</div>
  }

  if (errorType === 'forbidden') {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
        <h2 style={{ marginBottom: 8 }}>Not authorized</h2>
        <p style={{ color: 'var(--ink-fade, #999)' }}>This account doesn't have admin access to the cross-tenant dashboard.</p>
      </div>
    )
  }

  if (errorType === 'error' || !data) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
        <h2 style={{ marginBottom: 8 }}>Couldn't load the dashboard</h2>
        <p style={{ color: 'var(--ink-fade, #999)' }}>Something went wrong fetching admin data. Try refreshing.</p>
      </div>
    )
  }

  const visibleTenants = data.tenants.filter(t => showInactive || t.is_active)
  const totalOips = data.tenants.reduce((n, t) => n + t.oips.length, 0)
  const activeCount = data.tenants.filter(t => t.is_active).length
  const inactiveCount = data.tenants.length - activeCount

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Admin dashboard</h1>
        <span style={{ fontSize: 12, color: 'var(--ink-fade, #999)' }}>
          generated {formatDateTimeET(data.generated_at)}
        </span>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div style={{ background: 'var(--paper-alt, #f8f8f6)', borderRadius: 6, padding: '1rem' }}>
          <p style={{ fontSize: 12, color: 'var(--ink-fade, #999)', margin: '0 0 4px' }}>total tenants</p>
          <p style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{data.tenants.length}</p>
        </div>
        <div style={{ background: 'var(--paper-alt, #f8f8f6)', borderRadius: 6, padding: '1rem' }}>
          <p style={{ fontSize: 12, color: 'var(--ink-fade, #999)', margin: '0 0 4px' }}>active</p>
          <p style={{ fontSize: 22, fontWeight: 600, margin: 0, color: '#16a34a' }}>{activeCount}</p>
        </div>
        <div style={{ background: 'var(--paper-alt, #f8f8f6)', borderRadius: 6, padding: '1rem' }}>
          <p style={{ fontSize: 12, color: 'var(--ink-fade, #999)', margin: '0 0 4px' }}>inactive</p>
          <p style={{ fontSize: 22, fontWeight: 600, margin: 0, color: 'var(--ink-fade, #999)' }}>{inactiveCount}</p>
        </div>
        <div style={{ background: 'var(--paper-alt, #f8f8f6)', borderRadius: 6, padding: '1rem' }}>
          <p style={{ fontSize: 12, color: 'var(--ink-fade, #999)', margin: '0 0 4px' }}>total oips</p>
          <p style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{totalOips}</p>
        </div>
      </div>

      {/* Vertical health cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
        {(data.vertical_health || []).map(v => (
          <div key={v.vertical_slug} style={{ background: 'var(--paper, #fff)', border: '0.5px solid var(--rule-strong, #ddd)', borderRadius: 8, padding: '1rem 1.25rem' }}>
            <p style={{ fontWeight: 600, margin: '0 0 8px', textTransform: 'uppercase', fontSize: 13 }}>{v.vertical_slug}</p>
            <p style={{ fontSize: 13, color: 'var(--ink-fade, #999)', margin: '0 0 4px' }}>cadence: every {v.cadence_days}d</p>
            <p style={{ fontSize: 13, color: 'var(--ink-fade, #999)', margin: 0 }}>
              last kickoff: {v.last_kickoff_at ? formatDateTimeET(v.last_kickoff_at) : 'never run'}
            </p>
          </div>
        ))}
      </div>

      {/* Job queue — last 24 hours, newest first */}
      {data.recent_jobs && data.recent_jobs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontWeight: 600, margin: '0 0 8px', fontSize: 14 }}>Job queue (24h)</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--rule-strong, #ddd)' }}>
                <th style={{ textAlign: 'left', padding: '6px', color: 'var(--ink-fade, #999)', fontWeight: 500 }}>date</th>
                <th style={{ textAlign: 'left', padding: '6px', color: 'var(--ink-fade, #999)', fontWeight: 500 }}>job</th>
                <th style={{ textAlign: 'left', padding: '6px', color: 'var(--ink-fade, #999)', fontWeight: 500 }}>status</th>
                <th style={{ textAlign: 'left', padding: '6px', color: 'var(--ink-fade, #999)', fontWeight: 500 }}>start</th>
                <th style={{ textAlign: 'left', padding: '6px', color: 'var(--ink-fade, #999)', fontWeight: 500 }}>elapsed</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_jobs.map((job, i) => {
                const ts = job.finished_at || job.started_at || job.scheduled_for
                const statusColors = {
                  success: { bg: 'var(--bg-success, #dcfce7)', text: '#16a34a' },
                  failed_final: { bg: 'var(--bg-danger, #fee2e2)', text: '#dc2626' },
                  failed: { bg: 'var(--bg-danger, #fee2e2)', text: '#dc2626' },
                  running: { bg: 'var(--bg-accent, #dbeafe)', text: '#1d4ed8' },
                  skipped: { bg: 'var(--paper-alt, #f0f0f0)', text: 'var(--ink-fade, #999)' },
                }
                const sc = statusColors[job.status] || statusColors.skipped
                return (
                  <tr key={i} style={{ borderBottom: '0.5px solid var(--rule, #eee)' }}>
                    <td style={{ padding: '6px' }}>{formatDateET(ts)}</td>
                    <td style={{ padding: '6px' }}>
                      {job.job_type}
                      {job.oip_slug && <> &middot; {job.oip_slug}</>}
                      {!job.oip_slug && job.region_name && (
                        <>
                          {' '}&middot; {job.region_name} (
                          {job.states.map((s, si) => (
                            <span key={s.code}>
                              {si > 0 && ', '}
                              <span style={{ color: s.active ? '#16a34a' : 'var(--ink-fade, #999)', fontWeight: s.active ? 600 : 400 }}>
                                {s.code}
                              </span>
                            </span>
                          ))})
                        </>
                      )}
                      {!job.oip_slug && !job.region_name && job.vertical_slug && <> &middot; {job.vertical_slug}</>}
                    </td>
                    <td style={{ padding: '6px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, background: sc.bg, color: sc.text }}>
                        {job.status}
                      </span>
                    </td>
                    <td style={{ padding: '6px' }}>{job.started_at ? formatTimeET(job.started_at) : '—'}</td>
                    <td style={{ padding: '6px' }}>
                      {formatElapsed(job.started_at, job.finished_at, now)}
                      {job.status === 'running' && (
                        <span style={{
                          display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                          background: '#1d4ed8', marginLeft: 6, verticalAlign: 'middle',
                        }} />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
        Show inactive tenants
      </label>

      {/* Tenant-grouped OIP table */}
      {visibleTenants.map(tenant => (
        <div key={tenant.id} style={{ marginBottom: 24, opacity: tenant.is_active ? 1 : 0.55 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>{tenant.name}</h3>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 3,
              background: tenant.is_active ? 'var(--bg-success, #dcfce7)' : 'var(--paper-alt, #f0f0f0)',
              color: tenant.is_active ? '#16a34a' : 'var(--ink-fade, #999)',
            }}>
              {tenant.is_active ? 'active' : 'inactive'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--ink-fade, #999)' }}>{tenant.oips.length} OIP{tenant.oips.length !== 1 ? 's' : ''}</span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--rule-strong, #ddd)' }}>
                <th style={{ textAlign: 'left', padding: '6px', color: 'var(--ink-fade, #999)', fontWeight: 500 }}>OIP</th>
                <th style={{ textAlign: 'left', padding: '6px', color: 'var(--ink-fade, #999)', fontWeight: 500 }}>vertical</th>
                <th style={{ textAlign: 'left', padding: '6px', color: 'var(--ink-fade, #999)', fontWeight: 500 }}>status</th>
                <th style={{ textAlign: 'right', padding: '6px', color: 'var(--ink-fade, #999)', fontWeight: 500 }}>signals</th>
                <th style={{ textAlign: 'left', padding: '6px', color: 'var(--ink-fade, #999)', fontWeight: 500 }}>last score run</th>
                <th style={{ textAlign: 'right', padding: '6px', color: 'var(--ink-fade, #999)', fontWeight: 500 }}>records</th>
                <th style={{ textAlign: 'left', padding: '6px', color: 'var(--ink-fade, #999)', fontWeight: 500, width: 180 }}>score distribution</th>
              </tr>
            </thead>
            <tbody>
              {tenant.oips.map(oip => (
                <tr key={oip.id} style={{ borderBottom: '0.5px solid var(--rule, #eee)' }}>
                  <td style={{ padding: '6px' }}>{oip.slug}</td>
                  <td style={{ padding: '6px' }}>{oip.vertical}</td>
                  <td style={{ padding: '6px' }}>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 3,
                      background: oip.status === 'active' ? 'var(--bg-success, #dcfce7)' : 'var(--paper-alt, #f0f0f0)',
                      color: oip.status === 'active' ? '#16a34a' : 'var(--ink-fade, #999)',
                    }}>{oip.status}</span>
                  </td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{oip.signal_count.toLocaleString()}</td>
                  <td style={{ padding: '6px' }}>
                    {oip.latest_score_run?.finished_at ? (
                      <>
                        {formatDateET(oip.latest_score_run.finished_at)}
                        {oip.latest_score_run.status !== 'success' && (
                          <span style={{ marginLeft: 6, fontSize: 11, color: '#b45309' }}>({oip.latest_score_run.status})</span>
                        )}
                      </>
                    ) : <span style={{ color: 'var(--ink-fade, #999)' }}>never run</span>}
                  </td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>
                    {oip.latest_score_run?.stats?.signals_evaluated?.toLocaleString() ?? '—'}
                  </td>
                  <td style={{ padding: '6px' }}>
                    <ScoreDistributionBar oip={oip} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
