import { useState } from 'react'
import { useAwards } from '../../hooks/useAwards'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n) => {
  if (n == null) return '—'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${Math.round(n).toLocaleString()}`
}

const fmtDate = (d) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) }
  catch { return d }
}

const daysBetween = (a, b) => {
  if (!a || !b) return null
  try {
    const diff = Math.round((new Date(b) - new Date(a)) / 86400000)
    return diff
  } catch { return null }
}

const fmtGap = (days) => {
  if (days == null) return '—'
  if (days < 0)   return `${Math.abs(days)}d before RFP`
  if (days < 30)  return `${days}d after PoP`
  if (days < 365) return `${Math.round(days / 30)}mo gap`
  return `${(days / 365).toFixed(1)}yr gap`
}

const simColor = (score) => {
  if (score == null) return { bg: 'var(--bg)', border: 'var(--rule)', text: 'var(--ink-fade)' }
  if (score >= 70)   return { bg: '#e8f5e9', border: '#43a047', text: '#2e7d32' }
  if (score >= 40)   return { bg: '#fff8e1', border: '#ffa000', text: '#e65100' }
  return               { bg: '#f5f5f5', border: '#bdbdbd', text: '#757575' }
}

const CONFIDENCE_COLORS = {
  high:   { bg: '#e8f5e9', border: '#43a047', text: '#2e7d32', label: 'HIGH' },
  medium: { bg: '#fff8e1', border: '#ffa000', text: '#e65100', label: 'MED'  },
}

/**
 * AwardIntel — USASpending recompete candidate matrix + leaderboard.
 *
 * Usage in SignalDrawer (App.jsx):
 *   import AwardIntel from './components/awards/AwardIntel'
 *   {isSam && !isDib && (
 *     <AwardIntel
 *       signalId={os.signal_id}
 *       oipId={os.oip_id}
 *       responseDeadline={meta.response_deadline}
 *       signalTitle={sig.title}
 *     />
 *   )}
 */
export default function AwardIntel({ signalId, oipId, responseDeadline, signalTitle }) {
  const { candidates, recipients, summary, loading, hasData } = useAwards(signalId, oipId)
  const [open, setOpen]           = useState(true)
  const [view, setView]           = useState('matrix')   // 'matrix' | 'leaderboard'
  const [showAll, setShowAll]     = useState(false)
  const [expanded, setExpanded]   = useState(null)       // expanded candidate id

  const conf = CONFIDENCE_COLORS[summary?.match_confidence] || CONFIDENCE_COLORS.medium

  const sectionLbl = (txt) => (
    <div style={{
      fontSize: 20, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '.08em',
      color: 'var(--primary)', marginBottom: 12, marginTop: 20,
    }}>{txt}</div>
  )

  const divider = <hr style={{ border: 'none', borderTop: '1px solid var(--rule)', margin: '20px 0' }} />

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ marginBottom: 24 }}>
        {divider}
        <div style={{ fontSize: 20, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink)', marginBottom: 14 }}>
          Award Intelligence
        </div>
        <div style={{ padding: '14px 16px', background: 'var(--bg)',
          borderLeft: '3px solid var(--rule)', borderRadius: '0 4px 4px 0',
          fontSize: 17, color: 'var(--ink-fade)', fontStyle: 'italic' }}>
          Loading award intelligence…
        </div>
      </div>
    )
  }

  // ── No data ───────────────────────────────────────────────────────────────

  if (!hasData) {
    return (
      <div style={{ marginBottom: 24 }}>
        {divider}
        <div style={{ fontSize: 20, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink)', marginBottom: 14 }}>
          Award Intelligence
        </div>
        <div style={{ padding: '14px 16px', background: 'var(--bg)',
          borderLeft: '3px solid var(--rule)', borderRadius: '0 4px 4px 0',
          fontSize: 17, color: 'var(--ink-light)' }}>
          No matching historical awards found. Signal may be in a new space
          or under a NAICS with limited award history.
        </div>
      </div>
    )
  }

  // ── Matrix view ───────────────────────────────────────────────────────────

  const matrixRows = showAll ? candidates : candidates.slice(0, 5)

  const MatrixRow = ({ a, i }) => {
    const sc   = simColor(a.req_similarity)
    const gap  = daysBetween(a.pop_end_date, responseDeadline)
    const isEx = expanded === a.id
    const hasSim = a.req_similarity != null

    return (
      <div
        key={a.id}
        style={{
          borderLeft: `4px solid ${hasSim ? sc.border : 'var(--rule)'}`,
          background: hasSim && a.req_similarity >= 70 ? '#f9fffe' : 'var(--paper)',
          borderRadius: '0 6px 6px 0',
          marginBottom: 10,
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,.06)',
        }}
      >
        {/* Row header */}
        <div
          onClick={() => setExpanded(isEx ? null : a.id)}
          style={{ padding: '14px 18px', cursor: 'pointer', display: 'grid',
            gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}
        >
          <div>
            {/* Recipient */}
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
              {i === 0 && hasSim && <span style={{ color: 'var(--primary)', marginRight: 6 }}>★</span>}
              {a.recipient_name || '—'}
            </div>
            {/* Agency · Office */}
            <div style={{ fontSize: 14, color: 'var(--ink-light)',
              fontFamily: "'IBM Plex Mono', monospace", marginBottom: 6 }}>
              {a.awarding_agency_name}
              {a.awarding_office_name && ` · ${a.awarding_office_name}`}
            </div>
            {/* Meta row */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13,
              fontFamily: "'IBM Plex Mono', monospace', color: 'var(--ink-fade)'" }}>
              <span style={{ color: 'var(--ink-fade)' }}>
                Award: {fmtDate(a.pop_start_date)}
              </span>
              <span style={{ color: 'var(--ink-fade)' }}>
                PoP end: {fmtDate(a.pop_end_date)}
              </span>
              {gap != null && (
                <span style={{
                  color: Math.abs(gap) < 365 ? '#e65100' : 'var(--ink-fade)',
                  fontWeight: Math.abs(gap) < 365 ? 700 : 400,
                }}>
                  Gap: {fmtGap(gap)}
                </span>
              )}
              {a.is_recompete_signal && (
                <span style={{ color: '#e65100', fontWeight: 700 }}>⚑ RECOMPETE</span>
              )}
            </div>
          </div>

          {/* Similarity badge */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            {hasSim ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: 24, fontWeight: 800, color: sc.text,
                  fontFamily: "'IBM Plex Mono', monospace",
                  lineHeight: 1,
                }}>
                  {a.req_similarity}
                </div>
                <div style={{ fontSize: 10, color: sc.text, letterSpacing: '.08em',
                  fontFamily: "'IBM Plex Mono', monospace", textTransform: 'uppercase' }}>
                  match
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--ink-fade)',
                fontFamily: "'IBM Plex Mono', monospace" }}>
                not scored
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--ink-fade)',
              fontFamily: "'IBM Plex Mono', monospace" }}>
              {isEx ? '▲' : '▼'}
            </div>
          </div>
        </div>

        {/* Expanded detail */}
        {isEx && (
          <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--rule)' }}>
            {/* Prior contract description */}
            {a.award_description && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
                  textTransform: 'uppercase', letterSpacing: '.1em',
                  color: 'var(--ink-fade)', marginBottom: 6 }}>
                  Prior Contract Scope
                </div>
                <div style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--ink)',
                  background: 'var(--bg)', padding: '10px 14px', borderRadius: 4 }}>
                  {a.award_description}
                </div>
              </div>
            )}

            {/* LLM rationale */}
            {a.req_rationale && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
                  textTransform: 'uppercase', letterSpacing: '.1em',
                  color: 'var(--ink-fade)', marginBottom: 6 }}>
                  Requirements Analysis
                </div>
                <div style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--ink)',
                  padding: '10px 14px', background: sc.bg,
                  borderLeft: `3px solid ${sc.border}`, borderRadius: '0 4px 4px 0' }}>
                  {a.req_rationale}
                </div>
              </div>
            )}

            {/* Key matches + differences */}
            {(a.key_matches?.length > 0 || a.key_differences?.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                {a.key_matches?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
                      textTransform: 'uppercase', letterSpacing: '.1em',
                      color: '#2e7d32', marginBottom: 6 }}>
                      ✓ Matches
                    </div>
                    {a.key_matches.map((m, i) => (
                      <div key={i} style={{ fontSize: 14, color: 'var(--ink)',
                        padding: '3px 0', borderBottom: '1px solid var(--rule)' }}>
                        {m}
                      </div>
                    ))}
                  </div>
                )}
                {a.key_differences?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
                      textTransform: 'uppercase', letterSpacing: '.1em',
                      color: '#e65100', marginBottom: 6 }}>
                      △ Differences
                    </div>
                    {a.key_differences.map((d, i) => (
                      <div key={i} style={{ fontSize: 14, color: 'var(--ink)',
                        padding: '3px 0', borderBottom: '1px solid var(--rule)' }}>
                        {d}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Leaderboard view ──────────────────────────────────────────────────────

  const LeaderboardRow = ({ r, i }) => {
    const [showAllLb, setShowAllLb] = useState(false)
    const topN = recipients.slice(0, showAll ? recipients.length : 5)
    return null  // handled below
  }

  return (
    <div style={{ marginBottom: 24 }}>
      {divider}

      {/* Header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', userSelect: 'none', marginBottom: open ? 12 : 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 20, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--primary)' }}>
            Award Intelligence
          </div>
          <span style={{
            fontSize: 13, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace",
            padding: '3px 10px', borderRadius: 3,
            background: conf.bg, border: `2px solid ${conf.border}`, color: conf.text,
            letterSpacing: '.1em',
          }}>
            {conf.label}
          </span>
          <span style={{ fontSize: 13, color: 'var(--ink-light)',
            fontFamily: "'IBM Plex Mono', monospace" }}>
            {summary?.match_basis === 'same_office'
              ? 'same contracting office'
              : 'agency match — not office-specific'}
          </span>
        </div>
        <span style={{ fontSize: 13, color: 'var(--primary)', opacity: 0.7 }}>
          {open ? '▲' : '▼'}
        </span>
      </div>

      {/* Collapsed summary */}
      {!open && summary && (
        <div style={{ fontSize: 14, fontFamily: "'IBM Plex Mono', monospace",
          color: 'var(--ink-light)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span>{summary.unique_recipients} recipient{summary.unique_recipients !== 1 ? 's' : ''}</span>
          {summary.top_similarity != null && (
            <span style={{ color: summary.top_similarity >= 70 ? '#2e7d32' : 'var(--ink-fade)' }}>
              top match: {summary.top_similarity}
            </span>
          )}
          {summary.any_recompete && <span style={{ color: '#e65100' }}>⚑ recompete signal</span>}
          <span style={{ fontSize: 12, opacity: 0.6 }}>— click to expand</span>
        </div>
      )}

      {open && (
        <div>
          {/* View toggle */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 16 }}>
            {['matrix', 'leaderboard'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '7px 18px', border: '1px solid var(--rule-strong)',
                borderRadius: v === 'matrix' ? '3px 0 0 3px' : '0 3px 3px 0',
                background: view === v ? 'var(--primary)' : 'var(--paper)',
                color: view === v ? 'white' : 'var(--ink-light)',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '.08em', cursor: 'pointer',
              }}>
                {v === 'matrix' ? 'Recompete Matrix' : 'Who Wins Here'}
              </button>
            ))}
          </div>

          {/* ── MATRIX ── */}
          {view === 'matrix' && (
            <div>
              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto',
                padding: '0 18px 8px', fontSize: 11, fontFamily: "'IBM Plex Mono', monospace",
                textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--ink-fade)' }}>
                <span>Recipient · Agency · Timing</span>
                <span>Req. Match</span>
              </div>

              {matrixRows.map((a, i) => <MatrixRow key={a.id || i} a={a} i={i} />)}

              {candidates.length > 5 && (
                <button onClick={() => setShowAll(s => !s)} style={{
                  background: 'none', border: 'none', padding: '8px 0',
                  fontSize: 14, fontFamily: "'IBM Plex Mono', monospace",
                  color: 'var(--primary)', cursor: 'pointer',
                  fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3,
                }}>
                  {showAll ? '▲ Show top 5 only' : `▼ Show all ${candidates.length} candidates`}
                </button>
              )}

              <div style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-fade)',
                fontFamily: "'IBM Plex Mono', monospace", fontStyle: 'italic' }}>
                Click a row to expand scope comparison. Confirm incumbent with contracting officer.
              </div>
            </div>
          )}

          {/* ── LEADERBOARD ── */}
          {view === 'leaderboard' && (
            <div>
              {/* Summary stats */}
              {summary?.min_amount != null && (
                <div style={{ display: 'flex', gap: 24, marginBottom: 16,
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 15 }}>
                  <span><span style={{ color: 'var(--ink-fade)', fontSize: 12 }}>MIN </span>{fmt(summary.min_amount)}</span>
                  <span><span style={{ color: 'var(--ink-fade)', fontSize: 12 }}>AVG </span>{fmt(summary.avg_amount)}</span>
                  <span><span style={{ color: 'var(--ink-fade)', fontSize: 12 }}>MAX </span>{fmt(summary.max_amount)}</span>
                </div>
              )}

              {(showAll ? recipients : recipients.slice(0, 5)).map((r, i) => (
                <div key={r.recipient_name} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 0', borderBottom: '1px solid var(--rule)', gap: 12,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {i === 0 && <span style={{ color: 'var(--primary)', marginRight: 6 }}>★</span>}
                      {r.recipient_name}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--ink-light)',
                      fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>
                      {r.award_count} award{r.award_count !== 1 ? 's' : ''}
                      {r.best_similarity != null && (
                        <span style={{ marginLeft: 12,
                          color: r.best_similarity >= 70 ? '#2e7d32' : 'var(--ink-fade)' }}>
                          best match: {r.best_similarity}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)',
                    fontFamily: "'IBM Plex Mono', monospace", whiteSpace: 'nowrap' }}>
                    {fmt(r.total_awarded)}
                  </div>
                </div>
              ))}

              {recipients.length > 5 && (
                <button onClick={() => setShowAll(s => !s)} style={{
                  background: 'none', border: 'none', padding: '8px 0',
                  fontSize: 14, fontFamily: "'IBM Plex Mono', monospace",
                  color: 'var(--primary)', cursor: 'pointer',
                  fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3,
                }}>
                  {showAll ? '▲ Show top 5 only' : `▼ Show all ${recipients.length} awardees`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
