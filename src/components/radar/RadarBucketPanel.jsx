// src/components/radar/RadarBucketPanel.jsx
import React, { useState, useMemo } from 'react'

const fmt      = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtShort = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })

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

// urgency: 'alert' = red (RFP imminent), 'active' = amber (pursue now), 'early' = green (position)
function urgencyColor(urgency) {
  if (urgency === 'alert')  return '#a01818'
  if (urgency === 'active') return '#875214'
  return '#0d5e44'
}

const COLS = [
  { key: 'piid',             label: 'Contract', sortable: false },
  { key: 'incumbent_name',   label: 'Owner',    sortable: true  },
  { key: 'naics_code',       label: 'NAICS',    sortable: true  },
  { key: 'psc_code',         label: 'PSC',      sortable: true  },
  { key: 'pop_end_date',     label: 'Expires',  sortable: true  },
  { key: 'award_amount',     label: 'Value',    sortable: true  },
  { key: 'incumbent_health', label: 'Score',    sortable: true  },
]

export default function RadarBucketPanel({ title, sublabel, signals, urgency, onScoreClick }) {
  const [open,    setOpen]    = useState(urgency === 'active')
  const [sortKey, setSortKey] = useState('pop_end_date')
  const [sortDir, setSortDir] = useState('asc')

  const accentColor = urgencyColor(urgency)
  const totalValue  = signals.reduce((s, r) => s + (r.award_amount || 0), 0)

  const sorted = useMemo(() => {
    return [...signals].sort((a, b) => {
      let av = a[sortKey]
      let bv = b[sortKey]
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [signals, sortKey, sortDir])

  function handleSort(key) {
    if (!COLS.find(c => c.key === key)?.sortable) return
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return (
    <div style={{
      border: '1px solid var(--rule)', borderRadius: 4,
      background: 'var(--paper)', overflow: 'hidden', marginBottom: 14
    }}>

      {/* Bucket header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '22px 26px',
          background: 'none', border: 'none',
          borderLeft: `5px solid ${accentColor}`,
          cursor: 'pointer', textAlign: 'left'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flex: 1 }}>
          <div>
            <div style={{
              fontFamily: "'Spectral', Georgia, serif",
              fontSize: 26, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.1
            }}>
              {title}
            </div>
            {sublabel && (
              <div style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 13, color: accentColor, marginTop: 4, fontWeight: 500
              }}>
                {sublabel}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, marginLeft: 8 }}>
            <span style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, fontWeight: 600,
              color: 'var(--ink-fade)', background: 'var(--bg)',
              border: '1px solid var(--rule)', padding: '4px 14px', borderRadius: 2
            }}>
              {signals.length} contract{signals.length !== 1 ? 's' : ''}
            </span>
            {signals.length > 0 && (
              <span style={{
                fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, fontWeight: 600,
                color: accentColor, background: 'var(--bg)',
                border: '1px solid var(--rule)', padding: '4px 14px', borderRadius: 2
              }}>
                {fmtShort.format(totalValue)}
              </span>
            )}
          </div>
        </div>

        <div style={{
          width: 40, height: 40, borderRadius: 3,
          border: '1px solid var(--rule)', background: 'var(--bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
        }}>
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 18,
            color: 'var(--ink-fade)', lineHeight: 1,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s ease', display: 'block'
          }}>
            ▼
          </span>
        </div>
      </button>

      {/* Table */}
      {open && (
        <div style={{ overflowX: 'auto', borderTop: '1px solid var(--rule)' }}>
          {signals.length === 0 ? (
            <div style={{
              padding: '32px 24px', textAlign: 'center',
              fontSize: 18, color: 'var(--ink-fade)', fontStyle: 'italic'
            }}>
              No contracts in this window
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 17 }}>
              <thead>
                <tr>
                  {COLS.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      style={{
                        padding: '14px 18px',
                        textAlign: col.key === 'award_amount' || col.key === 'incumbent_health' ? 'right' : 'left',
                        fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600,
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: sortKey === col.key ? 'var(--primary)' : 'var(--ink-fade)',
                        cursor: col.sortable ? 'pointer' : 'default',
                        whiteSpace: 'nowrap', background: 'var(--bg)',
                        borderBottom: '1px solid var(--rule)', userSelect: 'none'
                      }}
                    >
                      {col.label}
                      {col.sortable && sortKey === col.key && (
                        <span style={{ marginLeft: 5, color: 'var(--primary)' }}>
                          {sortDir === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((sig, i) => {
                  const color = healthColor(sig.incumbent_health)
                  const bg    = healthBg(sig.incumbent_health)
                  const label = healthLabel(sig.incumbent_health)
                  return (
                    <tr
                      key={sig.id || i}
                      style={{ borderBottom: '1px solid var(--rule)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-soft)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '17px 18px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, color: 'var(--ink-fade)' }}>
                        {sig.piid || '—'}
                      </td>
                      <td style={{ padding: '17px 18px', color: 'var(--ink)', maxWidth: 280 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 17 }}>
                          {sig.incumbent_name || '—'}
                        </div>
                      </td>
                      <td style={{ padding: '17px 18px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, color: 'var(--ink-fade)' }}>
                        {sig.naics_code || '—'}
                      </td>
                      <td style={{ padding: '17px 18px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, color: 'var(--ink-fade)' }}>
                        {sig.psc_code || '—'}
                      </td>
                      <td style={{ padding: '17px 18px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, color: 'var(--ink-light)', whiteSpace: 'nowrap' }}>
                        {sig.pop_end_date || '—'}
                      </td>
                      <td style={{ padding: '17px 18px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 17, color: 'var(--ink)', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>
                        {sig.award_amount ? fmt.format(sig.award_amount) : '—'}
                      </td>
                      <td style={{ padding: '17px 18px', textAlign: 'right' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); onScoreClick(sig) }}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 10,
                            cursor: 'pointer', padding: '8px 16px', borderRadius: 3,
                            border: `1px solid ${color}44`, background: bg,
                            fontFamily: "'IBM Plex Mono', monospace", transition: 'opacity 0.15s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                        >
                          <span style={{ fontSize: 20, fontWeight: 600, color }}>
                            {sig.incumbent_health ?? '—'}
                          </span>
                          <span style={{ fontSize: 14, color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {label}
                          </span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
