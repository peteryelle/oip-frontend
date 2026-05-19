// src/components/radar/RadarDrawer.jsx
import React from 'react'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function healthColor(score) {
  if (score === null || score === undefined) return '#9d9788'
  if (score >= 70) return '#a01818'
  if (score >= 45) return '#875214'
  return '#0d5e44'
}

function healthBg(score) {
  if (score === null || score === undefined) return '#f4f1e8'
  if (score >= 70) return '#fde8e8'
  if (score >= 45) return '#fef4e6'
  return '#dcf2e6'
}

function healthLabel(score) {
  if (score === null || score === undefined) return 'Unscored'
  if (score >= 70) return 'Entrenched'
  if (score >= 45) return 'Mixed'
  return 'Opportunity'
}

// Build a SAM.gov opportunities search URL from signal fields
function buildSamSearchUrl(signal) {
  const params = new URLSearchParams()
  params.set('index', 'opp')
  params.set('sort', '-modifiedDate')
  if (signal.naics_code) {
    params.set('sfm[naicsCode][0]', signal.naics_code)
  }
  // Use PIID keywords to try to find the recompete solicitation
  if (signal.piid) {
    params.set('keywords', signal.piid)
  }
  return `https://sam.gov/search/?${params.toString()}`
}

// Build a broader SAM.gov search by agency + NAICS (more likely to catch the recompete)
function buildSamAgencySearchUrl(signal) {
  const params = new URLSearchParams()
  params.set('index', 'opp')
  params.set('sort', '-modifiedDate')
  if (signal.naics_code) {
    params.set('sfm[naicsCode][0]', signal.naics_code)
  }
  return `https://sam.gov/search/?${params.toString()}`
}

export default function RadarDrawer({ signal, onClose }) {
  if (!signal) return null

  const color   = healthColor(signal.incumbent_health)
  const bg      = healthBg(signal.incumbent_health)
  const label   = healthLabel(signal.incumbent_health)
  const score   = signal.incumbent_health ?? '—'
  const bullets = signal.incumbent_health_bullets || []

  const samPiidUrl   = buildSamSearchUrl(signal)
  const samNaicsUrl  = buildSamAgencySearchUrl(signal)

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(15,17,20,.42)', zIndex: 100 }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(620px, 92vw)',
        background: 'var(--paper)', borderLeft: '1px solid var(--rule)',
        zIndex: 101, overflowY: 'auto',
        boxShadow: '-8px 0 28px rgba(15,17,20,.08)',
        display: 'flex', flexDirection: 'column'
      }}>

        {/* Header */}
        <div style={{
          padding: '30px 34px 24px', borderBottom: '1px solid var(--rule)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'
        }}>
          <div>
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--ink-fade)', marginBottom: 10
            }}>
              Incumbent Profile
            </div>
            <div style={{
              fontFamily: "'Spectral', Georgia, serif",
              fontSize: 24, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2
            }}>
              {signal.incumbent_name || '—'}
            </div>
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 14, color: 'var(--ink-fade)', marginTop: 8
            }}>
              {signal.awarding_agency || '—'}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--ink-fade)', fontSize: 28, lineHeight: 1, padding: 4, marginTop: -4
          }}>
            ×
          </button>
        </div>

        {/* Health score block */}
        <div style={{ padding: '26px 34px', borderBottom: '1px solid var(--rule)', background: bg }}>
          <div style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase', color, marginBottom: 16
          }}>
            Incumbent Health
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 56, fontWeight: 500,
              color, lineHeight: 1, letterSpacing: '-2px', fontVariantNumeric: 'tabular-nums'
            }}>
              {score}
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color, marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color }}>out of 100</div>
            </div>
          </div>

          <div style={{
            height: 7, borderRadius: 3, background: 'rgba(0,0,0,0.1)',
            overflow: 'hidden', marginBottom: 18
          }}>
            <div style={{
              height: '100%', width: `${score === '—' ? 0 : score}%`,
              background: color, borderRadius: 3
            }} />
          </div>

          {signal.incumbent_health_narrative && (
            <div style={{ fontSize: 16, color, lineHeight: 1.6, fontStyle: 'italic', fontWeight: 500 }}>
              {signal.incumbent_health_narrative}
            </div>
          )}
        </div>

        {/* Health bullets */}
        {bullets.length > 0 && (
          <div style={{ padding: '24px 34px', borderBottom: '1px solid var(--rule)' }}>
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--ink-fade)', marginBottom: 16
            }}>
              Signal Detail
            </div>
            {bullets.map((b, i) => (
              <div key={i} style={{
                display: 'flex', gap: 12, marginBottom: 12,
                fontSize: 16, color: 'var(--ink-light)', lineHeight: 1.5
              }}>
                <span style={{ color: 'var(--primary)', flexShrink: 0 }}>▸</span>
                <span>{b}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Recompete Search Box ── */}
        <div style={{
          margin: '24px 34px',
          padding: '20px 24px',
          background: signal.sam_solicitation_posted ? '#dcf2e6' : '#f4f1e8',
          border: `1px solid ${signal.sam_solicitation_posted ? '#0d5e4444' : 'var(--rule)'}`,
          borderRadius: 4
        }}>
          <div style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: signal.sam_solicitation_posted ? '#0d5e44' : 'var(--ink-fade)',
            marginBottom: 14
          }}>
            {signal.sam_solicitation_posted ? '✓ Recompete Solicitation Found' : 'Find Recompete Solicitation'}
          </div>

          {signal.sam_solicitation_posted ? (
            /* Solicitation already linked */
            <div style={{ fontSize: 16, color: '#0d5e44', fontWeight: 600 }}>
              RFP has posted — see signal in Market Review
            </div>
          ) : (
            /* Search parameters + links */
            <>
              <div style={{ marginBottom: 16 }}>
                {[
                  ['Incumbent PIID',  signal.piid],
                  ['Agency',          signal.awarding_agency],
                  ['Office',          signal.awarding_office],
                  ['NAICS',           signal.naics_code || '—'],
                  ['PSC',             signal.psc_code || '—'],
                  ['PoP End',         signal.pop_end_date || '—'],
                  ['State',           signal.place_of_performance_state || '—'],
                ].map(([lbl, val]) => (
                  <div key={lbl} style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'baseline', gap: 12,
                    paddingBottom: 8, marginBottom: 8,
                    borderBottom: '1px solid var(--rule)'
                  }}>
                    <span style={{
                      fontFamily: "'IBM Plex Mono', monospace", fontSize: 13,
                      color: 'var(--ink-fade)', textTransform: 'uppercase',
                      letterSpacing: '0.06em', flexShrink: 0
                    }}>
                      {lbl}
                    </span>
                    <span style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 14, color: 'var(--ink)', fontWeight: 600, textAlign: 'right'
                    }}>
                      {val}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <a
                  href={samPiidUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 16px', background: 'var(--paper)',
                    border: '1px solid var(--rule)', borderRadius: 3,
                    textDecoration: 'none', color: 'var(--ink)',
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600,
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-soft)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--paper)'}
                >
                  <span>Search SAM.gov by PIID</span>
                  <span style={{ fontSize: 16 }}>→</span>
                </a>
                <a
                  href={samNaicsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 16px', background: 'var(--paper)',
                    border: '1px solid var(--rule)', borderRadius: 3,
                    textDecoration: 'none', color: 'var(--ink)',
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600,
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-soft)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--paper)'}
                >
                  <span>Search SAM.gov by NAICS {signal.naics_code || ''}</span>
                  <span style={{ fontSize: 16 }}>→</span>
                </a>
              </div>

              <div style={{
                marginTop: 14, fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12, color: 'var(--ink-fade)', lineHeight: 1.5
              }}>
                Use the PIID search to find the recompete solicitation directly. If not found, search by NAICS and filter by agency and active status. This panel will update automatically when the solicitation is detected.
              </div>
            </>
          )}
        </div>

        {/* Contract details */}
        <div style={{ padding: '0 34px 24px' }}>
          <div style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--ink-fade)', marginBottom: 18
          }}>
            Contract Detail
          </div>

          {[
            ['PIID',        signal.piid],
            ['Office',      signal.awarding_office],
            ['Award Value', signal.award_amount ? fmt.format(signal.award_amount) : '—'],
            ['NAICS',       signal.naics_code || '—'],
            ['PSC',         signal.psc_code || '—'],
            ['PSC Type',    signal.psc_type || '—'],
            ['Set-Aside',   signal.set_aside_type || '—'],
            ['PoP Start',   signal.pop_start_date || '—'],
            ['PoP End',     signal.pop_end_date || '—'],
            ['Expires',     signal.pop_bucket],
            ['Mods',        signal.mod_count ?? '—'],
            ['State',       signal.place_of_performance_state || '—'],
          ].map(([lbl, val]) => (
            <div key={lbl} style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'baseline', paddingBottom: 12,
              marginBottom: 12, borderBottom: '1px solid var(--rule)', gap: 16
            }}>
              <span style={{
                fontFamily: "'IBM Plex Mono', monospace", fontSize: 14,
                color: 'var(--ink-fade)', flexShrink: 0,
                textTransform: 'uppercase', letterSpacing: '0.06em'
              }}>
                {lbl}
              </span>
              <span style={{ fontSize: 16, color: 'var(--ink)', textAlign: 'right', wordBreak: 'break-word', fontWeight: 500 }}>
                {val}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
