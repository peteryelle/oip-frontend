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

export default function RadarDrawer({ signal, onClose }) {
  if (!signal) return null

  const color   = healthColor(signal.incumbent_health)
  const bg      = healthBg(signal.incumbent_health)
  const label   = healthLabel(signal.incumbent_health)
  const score   = signal.incumbent_health ?? '—'
  const bullets = signal.incumbent_health_bullets || []

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,17,20,.42)',
          zIndex: 100
        }}
      />

      {/* Drawer */}
      <div style={{
        position:      'fixed',
        top:           0,
        right:         0,
        bottom:        0,
        width:         'min(600px, 92vw)',
        background:    'var(--paper)',
        borderLeft:    '1px solid var(--rule)',
        zIndex:        101,
        overflowY:     'auto',
        boxShadow:     '-8px 0 28px rgba(15,17,20,.08)',
        display:       'flex',
        flexDirection: 'column'
      }}>

        {/* Header */}
        <div style={{
          padding:        '30px 34px 24px',
          borderBottom:   '1px solid var(--rule)',
          display:        'flex',
          justifyContent: 'space-between',
          alignItems:     'flex-start'
        }}>
          <div>
            <div style={{
              fontFamily:    "'IBM Plex Mono', monospace",
              fontSize:      13,
              fontWeight:    600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color:         'var(--ink-fade)',
              marginBottom:  10
            }}>
              Incumbent Profile
            </div>
            <div style={{
              fontFamily: "'Spectral', Georgia, serif",
              fontSize:   24,
              fontWeight: 600,
              color:      'var(--ink)',
              lineHeight: 1.2
            }}>
              {signal.incumbent_name || '—'}
            </div>
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize:   14,
              color:      'var(--ink-fade)',
              marginTop:  8
            }}>
              {signal.awarding_agency || '—'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border:     'none',
              cursor:     'pointer',
              color:      'var(--ink-fade)',
              fontSize:   28,
              lineHeight: 1,
              padding:    4,
              marginTop:  -4
            }}
          >
            ×
          </button>
        </div>

        {/* Health score block */}
        <div style={{
          padding:      '26px 34px',
          borderBottom: '1px solid var(--rule)',
          background:   bg
        }}>
          <div style={{
            fontFamily:    "'IBM Plex Mono', monospace",
            fontSize:      13,
            fontWeight:    600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color,
            marginBottom:  16
          }}>
            Incumbent Health
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
            <div style={{
              fontFamily:         "'IBM Plex Mono', monospace",
              fontSize:           56,
              fontWeight:         500,
              color,
              lineHeight:         1,
              letterSpacing:      '-2px',
              fontVariantNumeric: 'tabular-nums'
            }}>
              {score}
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color, marginBottom: 4 }}>
                {label}
              </div>
              <div style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize:   14,
                color
              }}>
                out of 100
              </div>
            </div>
          </div>

          {/* Score bar */}
          <div style={{
            height:       7,
            borderRadius: 3,
            background:   'rgba(0,0,0,0.1)',
            overflow:     'hidden',
            marginBottom: 18
          }}>
            <div style={{
              height:       '100%',
              width:        `${score === '—' ? 0 : score}%`,
              background:   color,
              borderRadius: 3
            }} />
          </div>

          {signal.incumbent_health_narrative && (
            <div style={{
              fontSize:   16,
              color,
              lineHeight: 1.6,
              fontStyle:  'italic',
              fontWeight: 500
            }}>
              {signal.incumbent_health_narrative}
            </div>
          )}
        </div>

        {/* Health bullets */}
        {bullets.length > 0 && (
          <div style={{ padding: '24px 34px', borderBottom: '1px solid var(--rule)' }}>
            <div style={{
              fontFamily:    "'IBM Plex Mono', monospace",
              fontSize:      13,
              fontWeight:    600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color:         'var(--ink-fade)',
              marginBottom:  16
            }}>
              Signal Detail
            </div>
            {bullets.map((b, i) => (
              <div key={i} style={{
                display:      'flex',
                gap:          12,
                marginBottom: 12,
                fontSize:     16,
                color:        'var(--ink-light)',
                lineHeight:   1.5
              }}>
                <span style={{ color: 'var(--primary)', flexShrink: 0 }}>▸</span>
                <span>{b}</span>
              </div>
            ))}
          </div>
        )}

        {/* Contract details */}
        <div style={{ padding: '24px 34px' }}>
          <div style={{
            fontFamily:    "'IBM Plex Mono', monospace",
            fontSize:      13,
            fontWeight:    600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color:         'var(--ink-fade)',
            marginBottom:  18
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
              display:        'flex',
              justifyContent: 'space-between',
              alignItems:     'baseline',
              paddingBottom:  12,
              marginBottom:   12,
              borderBottom:   '1px solid var(--rule)',
              gap:            16
            }}>
              <span style={{
                fontFamily:    "'IBM Plex Mono', monospace",
                fontSize:      14,
                color:         'var(--ink-fade)',
                flexShrink:    0,
                textTransform: 'uppercase',
                letterSpacing: '0.06em'
              }}>
                {lbl}
              </span>
              <span style={{
                fontSize:   16,
                color:      'var(--ink)',
                textAlign:  'right',
                wordBreak:  'break-word',
                fontWeight: 500
              }}>
                {val}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
