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

const gapDays = (popEnd, deadline) => {
  if (!popEnd || !deadline) return null
  try { return Math.round((new Date(deadline) - new Date(popEnd)) / 86400000) }
  catch { return null }
}

const gapLabel = (days) => {
  if (days == null) return { text: '—', color: 'var(--ink-fade)', strength: 'unknown' }
  const months = Math.round(days / 30)
  if (days < 0)    return { text: `PoP ends after RFP`, color: '#2e7d32', strength: 'strong' }
  if (days <= 270) return { text: `${months}mo gap`, color: '#2e7d32', strength: 'strong' }
  if (days <= 540) return { text: `${months}mo gap`, color: '#e65100', strength: 'moderate' }
  return               { text: `${months}mo gap`, color: '#b71c1c', strength: 'weak' }
}

const simColor = (score) => {
  if (score == null) return { color: 'var(--ink-fade)', bg: 'transparent' }
  if (score >= 70)   return { color: '#2e7d32', bg: '#e8f5e9' }
  if (score >= 40)   return { color: '#e65100', bg: '#fff8e1' }
  return               { color: '#757575', bg: '#f5f5f5' }
}

const CONF_COLORS = {
  high:   { bg: '#e8f5e9', border: '#43a047', text: '#2e7d32', label: 'HIGH' },
  medium: { bg: '#fff8e1', border: '#ffa000', text: '#e65100', label: 'MED'  },
}

const TH = ({ children, align = 'left', width }) => (
  <th style={{
    padding: '8px 12px', textAlign: align,
    fontSize: 11, fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em',
    color: 'var(--ink-fade)', borderBottom: '2px solid var(--rule)',
    whiteSpace: 'nowrap', width: width || 'auto',
    background: 'var(--bg)',
  }}>{children}</th>
)

const TD = ({ children, align = 'left', style = {} }) => (
  <td style={{
    padding: '10px 12px', textAlign: align,
    fontSize: 15, color: 'var(--ink)',
    borderBottom: '1px solid var(--rule)',
    verticalAlign: 'top',
    ...style,
  }}>{children}</td>
)

/**
 * AwardIntel — two modes:
 *   recompete  — candidate matrix table (services, supplies)
 *   market     — who wins in this space (construction, unknown)
 */
export default function AwardIntel({ signalId, oipId, responseDeadline, signalTitle }) {
  const { candidates, recipients, summary, loading, hasData } = useAwards(signalId, oipId)
  const [open, setOpen]         = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [showAll, setShowAll]   = useState(false)

  const conf = CONF_COLORS[summary?.match_confidence] || CONF_COLORS.medium

  const divider = <hr style={{ border: 'none', borderTop: '1px solid var(--rule)', margin: '24px 0' }} />

  const Header = () => (
    <div
      onClick={() => setOpen(o => !o)}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', userSelect: 'none', marginBottom: open ? 14 : 0 }}
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
  )

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ marginBottom: 24 }}>{divider}<Header />
      <div style={{ padding: '14px 16px', background: 'var(--bg)',
        borderLeft: '3px solid var(--rule)', fontSize: 17, color: 'var(--ink-fade)',
        fontStyle: 'italic', borderRadius: '0 4px 4px 0' }}>
        Loading award intelligence…
      </div>
    </div>
  )

  // ── No data ───────────────────────────────────────────────────────────────
  if (!hasData) return (
    <div style={{ marginBottom: 24 }}>{divider}<Header />
      <div style={{ padding: '14px 16px', background: 'var(--bg)',
        borderLeft: '3px solid var(--rule)', fontSize: 17, color: 'var(--ink-light)',
        borderRadius: '0 4px 4px 0' }}>
        No matching historical awards found for this agency and NAICS combination.
      </div>
    </div>
  )

  // ── Determine mode from PSC ────────────────────────────────────────────────
  // psc_type from the most common value across enriched candidates
  const enriched     = candidates.filter(c => c.psc_type)
  const pscTypes     = enriched.map(c => c.psc_type)
  const construction = pscTypes.filter(t => t === 'construction').length
  const isConstruction = construction > pscTypes.length / 2

  // ── MARKET INTELLIGENCE MODE (construction / one-time) ────────────────────
  if (isConstruction) {
    const topN = showAll ? recipients : recipients.slice(0, 5)
    return (
      <div style={{ marginBottom: 24 }}>
        {divider}
        <Header />
        {open && (
          <div>
            {/* Not a recompete notice */}
            <div style={{
              padding: '14px 18px', marginBottom: 20,
              background: '#fff8e1', borderLeft: '4px solid #ffa000',
              borderRadius: '0 6px 6px 0',
            }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#e65100',
                fontFamily: "'IBM Plex Mono', monospace", marginBottom: 4 }}>
                ⚑ NOT A RECOMPETE SITUATION
              </div>
              <div style={{ fontSize: 15, color: 'var(--ink)', lineHeight: 1.6 }}>
                PSC analysis indicates this is a construction or one-time build contract.
                These do not typically recompete — there is no incumbent to identify.
                Instead, review who has won similar work at this agency.
              </div>
            </div>

            {/* Who wins in this space */}
            <div style={{ fontSize: 20, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '.08em',
              color: 'var(--primary)', marginBottom: 14 }}>
              Who Wins In This Space
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <TH>Recipient</TH>
                  <TH align="right" width="80">Awards</TH>
                  <TH align="right" width="120">Total Won</TH>
                  <TH align="right" width="120">Avg Award</TH>
                </tr>
              </thead>
              <tbody>
                {topN.map((r, i) => (
                  <tr key={r.recipient_name}
                    style={{ background: i === 0 ? '#f0f7ff' : 'transparent' }}>
                    <TD>
                      <span style={{ fontWeight: 700 }}>
                        {i === 0 && <span style={{ color: 'var(--primary)', marginRight: 6 }}>★</span>}
                        {r.recipient_name}
                      </span>
                    </TD>
                    <TD align="right">{r.award_count}</TD>
                    <TD align="right" style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 15 }}>
                      {fmt(r.total_awarded)}
                    </TD>
                    <TD align="right" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15 }}>
                      {fmt(r.total_awarded / r.award_count)}
                    </TD>
                  </tr>
                ))}
              </tbody>
            </table>

            {recipients.length > 5 && (
              <button onClick={() => setShowAll(s => !s)} style={{
                background: 'none', border: 'none', padding: '10px 0 0',
                fontSize: 14, fontFamily: "'IBM Plex Mono', monospace",
                color: 'var(--primary)', cursor: 'pointer',
                fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3,
              }}>
                {showAll ? '▲ Show top 5 only' : `▼ Show all ${recipients.length} firms`}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── RECOMPETE MATRIX MODE (services, supplies) ────────────────────────────
  const matrixRows = showAll ? candidates : candidates.slice(0, 5)

  return (
    <div style={{ marginBottom: 24 }}>
      {divider}
      <Header />

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
          {/* Context explanation */}
          <div style={{
            fontSize: 15, lineHeight: 1.7, color: 'var(--ink-light)',
            marginBottom: 16, padding: '12px 16px',
            background: 'var(--bg)', borderLeft: '3px solid var(--rule)',
            borderRadius: '0 4px 4px 0',
          }}>
            These companies held prior federal contracts matching this solicitation's agency
            and NAICS code. A requirements comparison was run between each prior contract
            scope and the current solicitation — the <strong>Req. Match</strong> score reflects
            how closely the prior work aligns. Click any row to see the full scope comparison
            and incumbent health assessment.
          </div>

          {/* Solicitation header row */}
          <div style={{
            padding: '12px 16px', marginBottom: 16,
            background: '#f0f7ff', border: '1px solid #90caf9',
            borderRadius: 6, display: 'grid',
            gridTemplateColumns: '1fr auto auto', gap: 16, alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
                textTransform: 'uppercase', letterSpacing: '.1em',
                color: 'var(--ink-fade)', marginBottom: 4 }}>
                Current Solicitation
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
                {signalTitle || 'Solicitation'}
              </div>
            </div>
            {responseDeadline && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace",
                  color: 'var(--ink-fade)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
                  Due Date
                </div>
                <div style={{ fontSize: 15, fontWeight: 700,
                  fontFamily: "'IBM Plex Mono', monospace", color: 'var(--ink)' }}>
                  {fmtDate(responseDeadline)}
                </div>
              </div>
            )}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace",
                color: 'var(--ink-fade)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
                Status
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#2e7d32',
                fontFamily: "'IBM Plex Mono', monospace" }}>
                OPEN
              </div>
            </div>
          </div>

          {/* Candidate table */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <TH width="30%">Recipient</TH>
                <TH width="20%">Agency · Office</TH>
                <TH width="15%">Award Date</TH>
                <TH width="15%">PoP End</TH>
                <TH width="12%">Gap to RFP</TH>
                <TH width="8%" align="center">Req. Match</TH>
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((a, i) => {
                const sc   = simColor(a.req_similarity)
                const gap  = gapDays(a.pop_end_date, responseDeadline)
                const gl   = gapLabel(gap)
                const isEx = expanded === (a.id || i)

                return (
                  <>
                    <tr
                      key={a.id || i}
                      onClick={() => setExpanded(isEx ? null : (a.id || i))}
                      style={{
                        cursor: 'pointer',
                        background: i === 0 && a.req_similarity >= 70
                          ? '#f9fffe' : isEx ? '#fafafa' : 'transparent',
                      }}
                    >
                      <TD>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>
                          {i === 0 && a.req_similarity >= 70 &&
                            <span style={{ color: 'var(--primary)', marginRight: 6 }}>★</span>}
                          {a.recipient_name}
                        </div>
                        {a.award_title && (
                          <div style={{ fontSize: 12, color: 'var(--ink-fade)',
                            fontFamily: "'IBM Plex Mono', monospace", marginTop: 3 }}>
                            {a.award_title}
                          </div>
                        )}
                        {a.psc_code && (
                          <div style={{ fontSize: 11, color: 'var(--ink-fade)',
                            fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>
                            PSC: {a.psc_code}
                            {a.psc_description ? ` — ${a.psc_description}` : ''}
                          </div>
                        )}
                      </TD>
                      <TD>
                        <div style={{ fontSize: 14 }}>{a.awarding_agency_name}</div>
                        {a.awarding_office_name && a.awarding_office_name !== a.awarding_agency_name && (
                          <div style={{ fontSize: 12, color: 'var(--ink-fade)',
                            fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>
                            {a.awarding_office_name}
                          </div>
                        )}
                      </TD>
                      <TD style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14 }}>
                        {fmtDate(a.pop_start_date)}
                      </TD>
                      <TD style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14 }}>
                        {fmtDate(a.pop_end_date)}
                      </TD>
                      <TD>
                        <span style={{
                          fontSize: 14, fontWeight: 700,
                          fontFamily: "'IBM Plex Mono', monospace",
                          color: gl.color,
                        }}>
                          {gl.text}
                        </span>
                        {gl.strength === 'weak' && (
                          <div style={{ fontSize: 10, color: '#b71c1c',
                            fontFamily: "'IBM Plex Mono', monospace" }}>
                            weak signal
                          </div>
                        )}
                        {gl.strength === 'strong' && (
                          <div style={{ fontSize: 10, color: '#2e7d32',
                            fontFamily: "'IBM Plex Mono', monospace" }}>
                            strong signal
                          </div>
                        )}
                      </TD>
                      <TD align="center">
                        {a.req_similarity != null ? (
                          <div style={{
                            display: 'inline-block',
                            padding: '4px 10px', borderRadius: 4,
                            background: sc.bg,
                            fontSize: 18, fontWeight: 800,
                            fontFamily: "'IBM Plex Mono', monospace",
                            color: sc.color,
                          }}>
                            {a.req_similarity}
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--ink-fade)',
                            fontFamily: "'IBM Plex Mono', monospace" }}>—</span>
                        )}
                      </TD>
                    </tr>

                    {/* Expanded requirements detail */}
                    {isEx && (
                      <tr>
                        <td colSpan={6} style={{
                          padding: '0 12px 16px',
                          borderBottom: '2px solid var(--primary)',
                          background: '#fafafa',
                        }}>
                          {a.award_description && (
                            <div style={{ marginTop: 12 }}>
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
                          {a.req_rationale && (
                            <div style={{ marginTop: 12 }}>
                              <div style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
                                textTransform: 'uppercase', letterSpacing: '.1em',
                                color: 'var(--ink-fade)', marginBottom: 6 }}>
                                Requirements Analysis
                              </div>
                              <div style={{ fontSize: 15, lineHeight: 1.65,
                                padding: '10px 14px', color: 'var(--ink)',
                                background: sc.bg, borderLeft: `3px solid ${sc.color}`,
                                borderRadius: '0 4px 4px 0' }}>
                                {a.req_rationale}
                              </div>
                            </div>
                          )}
                          {(a.key_matches?.length > 0 || a.key_differences?.length > 0) && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
                              gap: 16, marginTop: 12 }}>
                              {a.key_matches?.length > 0 && (
                                <div>
                                  <div style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
                                    textTransform: 'uppercase', letterSpacing: '.1em',
                                    color: '#2e7d32', marginBottom: 6 }}>
                                    ✓ Scope Matches
                                  </div>
                                  {a.key_matches.map((m, j) => (
                                    <div key={j} style={{ fontSize: 14, color: 'var(--ink)',
                                      padding: '4px 0', borderBottom: '1px solid var(--rule)' }}>
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
                                    △ Scope Differences
                                  </div>
                                  {a.key_differences.map((d, j) => (
                                    <div key={j} style={{ fontSize: 14, color: 'var(--ink)',
                                      padding: '4px 0', borderBottom: '1px solid var(--rule)' }}>
                                      {d}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {/* Incumbent Health Panel */}
                          {a.incumbent_health != null && (
                            <div style={{ marginTop: 16 }}>
                              <div style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
                                textTransform: 'uppercase', letterSpacing: '.1em',
                                color: 'var(--ink-fade)', marginBottom: 8 }}>
                                Incumbent Health
                              </div>
                              {/* Score bar */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
                                <div style={{ flex: 1, height: 10, background: '#e0e0e0', borderRadius: 5, overflow: 'hidden' }}>
                                  <div style={{
                                    height: '100%', borderRadius: 5,
                                    width: `${a.incumbent_health}%`,
                                    background: a.incumbent_health >= 70 ? '#43a047'
                                      : a.incumbent_health >= 45 ? '#ffa000' : '#e53935',
                                    transition: 'width .4s ease',
                                  }} />
                                </div>
                                <div style={{
                                  fontSize: 22, fontWeight: 800,
                                  fontFamily: "'IBM Plex Mono', monospace",
                                  color: a.incumbent_health >= 70 ? '#2e7d32'
                                    : a.incumbent_health >= 45 ? '#e65100' : '#b71c1c',
                                  minWidth: 40, textAlign: 'right',
                                }}>
                                  {a.incumbent_health}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--ink-fade)',
                                  fontFamily: "'IBM Plex Mono', monospace" }}>
                                  / 100
                                </div>
                              </div>
                              {/* Bullets */}
                              {a.incumbent_health_bullets?.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                                  {a.incumbent_health_bullets.map((b, i) => (
                                    <div key={i} style={{
                                      fontSize: 14, color: 'var(--ink)',
                                      fontFamily: "'IBM Plex Mono', monospace",
                                      display: 'flex', alignItems: 'flex-start', gap: 8,
                                    }}>
                                      <span style={{
                                        color: b.startsWith('⚠') ? '#e65100' : '#2e7d32',
                                        minWidth: 14,
                                      }}>
                                        {b.startsWith('⚠') ? '⚠' : '✓'}
                                      </span>
                                      <span>{b.replace(/^⚠\s*/, '')}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {/* Narrative */}
                              {a.incumbent_health_narrative && (
                                <div style={{
                                  fontSize: 15, lineHeight: 1.6, fontWeight: 600,
                                  color: a.incumbent_health >= 70 ? '#2e7d32'
                                    : a.incumbent_health >= 45 ? '#e65100' : '#b71c1c',
                                  padding: '8px 12px',
                                  background: a.incumbent_health >= 70 ? '#e8f5e9'
                                    : a.incumbent_health >= 45 ? '#fff8e1' : '#ffebee',
                                  borderRadius: 4,
                                }}>
                                  → {a.incumbent_health_narrative}
                                </div>
                              )}
                            </div>
                          )}
                          <div style={{ marginTop: 12, fontSize: 13,
                            color: 'var(--ink-fade)', fontStyle: 'italic',
                            fontFamily: "'IBM Plex Mono', monospace" }}>
                            Confirm incumbent with contracting officer before pursuit decision.
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>

          {candidates.length > 5 && (
            <button onClick={() => setShowAll(s => !s)} style={{
              background: 'none', border: 'none', padding: '10px 0 0',
              fontSize: 14, fontFamily: "'IBM Plex Mono', monospace",
              color: 'var(--primary)', cursor: 'pointer',
              fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3,
            }}>
              {showAll
                ? '▲ Show top 5 only'
                : `▼ Show all ${candidates.length} candidates`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
