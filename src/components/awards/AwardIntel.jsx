import { useState } from 'react'
import { useAwards } from '../../hooks/useAwards'

const fmt = (n) => {
  if (n == null) return '—'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${Math.round(n).toLocaleString()}`
}

const CONFIDENCE_COLORS = {
  high:   { bg: '#e8f5e9', border: '#43a047', text: '#2e7d32', label: 'HIGH' },
  medium: { bg: '#fff8e1', border: '#ffa000', text: '#e65100', label: 'MED'  },
  low:    { bg: '#f5f5f5', border: '#bdbdbd', text: '#757575', label: 'LOW'  },
}

const BASIS_LABELS = {
  same_office:  'Same contracting office',
  same_agency:  'Same agency',
  naics_only:   'NAICS code only',
}

/**
 * AwardIntel — USASpending award intelligence panel for the signal drawer.
 *
 * Shows top recipients, pricing range, recompete signal, and canned questions.
 * Import into SignalDrawer in App.jsx:
 *
 *   import AwardIntel from './components/awards/AwardIntel'
 *   ...
 *   {isSam && !isDib && <AwardIntel signalId={os.signal_id} oipId={os.oip_id} />}
 */
export default function AwardIntel({ signalId, oipId }) {
  const { recipients, summary, loading, hasData } = useAwards(signalId, oipId)
  const [activeQuestion, setActiveQuestion] = useState(null)
  const [open, setOpen] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const lbl = (txt) => (
    <div style={{
      fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '.12em',
      color: 'var(--ink-fade)', marginBottom: 8,
    }}>{txt}</div>
  )

  const sectionLbl = (txt) => (
    <div style={{
      fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '.12em',
      color: 'var(--primary)', marginBottom: 8, marginTop: 16,
    }}>{txt}</div>
  )

  const divider = <hr style={{ border: 'none', borderTop: '1px solid var(--rule)', margin: '20px 0' }} />

  // ── Loading state ──
  if (loading) {
    return (
      <div style={{ marginBottom: 24 }}>
        {divider}
        {lbl('Award Intelligence')}
        <div style={{
          padding: '12px 16px', background: 'var(--bg)',
          borderLeft: '3px solid var(--rule)', borderRadius: '0 4px 4px 0',
          fontSize: 13, color: 'var(--ink-fade)', fontStyle: 'italic',
          fontFamily: "'IBM Plex Mono', monospace",
        }}>
          Loading award intelligence…
        </div>
      </div>
    )
  }

  // ── No data state ──
  if (!hasData) {
    return (
      <div style={{ marginBottom: 24 }}>
        {divider}
        {lbl('Award Intelligence')}
        <div style={{
          padding: '12px 16px', background: 'var(--bg)',
          borderLeft: '3px solid var(--rule)', borderRadius: '0 4px 4px 0',
          fontSize: 13, color: 'var(--ink-fade)', fontFamily: "'IBM Plex Mono', monospace",
        }}>
          No matching historical awards found. Signal may be in a new space
          or under a NAICS with limited award history.
        </div>
      </div>
    )
  }

  const conf   = CONFIDENCE_COLORS[summary.match_confidence] || CONFIDENCE_COLORS.low
  const top    = recipients[0] || {}
  const topN   = showAll ? recipients : recipients.slice(0, 5)
  const repeat = recipients.filter(r => r.award_count >= 2)

  // ── Canned question answers ──
  const questions = [
    {
      id: 'incumbent',
      label: 'Who likely holds the incumbent?',
      answer: top.recipient_name
        ? `${top.recipient_name} has the strongest historical footprint at this agency — ${fmt(top.total_awarded)} across ${top.award_count} award${top.award_count !== 1 ? 's' : ''}. Recommend confirming with the contracting officer.`
        : 'Insufficient data to identify a likely incumbent.',
    },
    {
      id: 'pricing',
      label: 'What did comparable work price at?',
      answer: summary.min_amount != null
        ? `Awards in this space ranged from ${fmt(summary.min_amount)} to ${fmt(summary.max_amount)}, with an average of ${fmt(summary.avg_amount)} across ${summary.total_rows} matched contract${summary.total_rows !== 1 ? 's' : ''}.`
        : 'Award amounts not available for this signal.',
    },
    {
      id: 'repeat',
      label: 'Who wins repeatedly at this agency?',
      answer: repeat.length > 0
        ? `${repeat.map(r => `${r.recipient_name} (${r.award_count} awards)`).join(', ')} ${repeat.length === 1 ? 'has' : 'have'} won multiple contracts at this agency in this space.`
        : 'No repeat winners identified in the matched award set.',
    },
  ]

  return (
    <div style={{ marginBottom: 24 }}>
      {divider}

      {/* Header — collapsible */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', userSelect: 'none', marginBottom: open ? 10 : 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--primary)',
          }}>
            Award Intelligence
          </div>
          {/* Confidence badge with explanation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 13, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace",
              padding: '3px 10px', borderRadius: 3,
              background: conf.bg, border: `2px solid ${conf.border}`, color: conf.text,
              letterSpacing: '.1em',
            }}>
              {conf.label}
            </span>
            <span style={{
              fontSize: 12, color: 'var(--ink-light)',
              fontFamily: "'IBM Plex Mono', monospace",
            }}>
              {summary?.match_basis === 'same_office'
                ? 'same contracting office'
                : summary?.match_basis === 'same_agency'
                  ? 'agency match — not office-specific'
                  : 'NAICS code only'}
            </span>
          </div>
        </div>
        <span style={{ fontSize: 13, color: 'var(--primary)', opacity: 0.7 }}>
          {open ? '▲' : '▼'}
        </span>
      </div>

      {!open && summary && (
        <div style={{
          fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
          color: 'var(--ink-fade)', marginTop: 4,
          display: 'flex', gap: 12, flexWrap: 'wrap',
        }}>
          <span>{summary.unique_recipients} recipient{summary.unique_recipients !== 1 ? 's' : ''}</span>
          {summary.avg_amount && <span>avg {fmt(summary.avg_amount)}</span>}
          {summary.any_recompete && <span style={{ color: '#e65100' }}>⚑ recompete</span>}
          <span style={{ fontSize: 11, opacity: 0.6 }}>— click to expand</span>
        </div>
      )}

      {open && (
        <div style={{
          padding: '14px 16px', background: 'var(--bg)',
          borderLeft: `3px solid ${conf.border}`, borderRadius: '0 4px 4px 0',
        }}>

          {/* Match basis */}
          <div style={{
            fontSize: 13, fontFamily: "'IBM Plex Mono', monospace",
            color: 'var(--ink-light)', marginBottom: 12,
          }}>
            {BASIS_LABELS[summary.match_basis] || summary.match_basis}
            {summary.agency && ` · ${summary.agency}`}
            <span style={{ marginLeft: 8, opacity: 0.7 }}>
              ({summary.total_rows} award{summary.total_rows !== 1 ? 's' : ''}, {summary.unique_recipients} recipient{summary.unique_recipients !== 1 ? 's' : ''})
            </span>
          </div>

          {/* Recompete signal */}
          {summary.any_recompete && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 11, fontFamily: "'IBM Plex Mono', monospace",
              fontWeight: 700, color: '#e65100',
              background: '#fff3e0', border: '1px solid #ffb74d',
              borderRadius: 3, padding: '3px 8px', marginBottom: 12,
              letterSpacing: '.06em',
            }}>
              ⚑ RECOMPETE SIGNAL — PoP end within 18 months
            </div>
          )}

          {/* Top recipients */}
          {sectionLbl('Top Recipients')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {topN.map((r, i) => (
              <div key={r.recipient_name} style={{
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: 8,
                padding: '6px 0',
                borderBottom: i < topN.length - 1 ? '1px solid var(--rule)' : 'none',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 15, fontWeight: 600, color: 'var(--ink)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {i === 0 && <span style={{ color: 'var(--primary)', marginRight: 6 }}>★</span>}
                    {r.recipient_name}
                  </div>
                  <div style={{
                    fontSize: 12, color: 'var(--ink-light)',
                    fontFamily: "'IBM Plex Mono', monospace", marginTop: 2,
                  }}>
                    {r.award_count} award{r.award_count !== 1 ? 's' : ''}
                    {r.any_recompete && <span style={{ color: '#e65100', marginLeft: 8 }}>⚑ recompete</span>}
                  </div>
                </div>
                <div style={{
                  fontSize: 15, fontWeight: 700, color: 'var(--ink)',
                  fontFamily: "'IBM Plex Mono', monospace",
                  whiteSpace: 'nowrap',
                }}>
                  {fmt(r.total_awarded)}
                </div>
              </div>
            ))}
          </div>

          {/* Show more / collapse toggle */}
          {recipients.length > 5 && (
            <div style={{ paddingTop: 8 }}>
              <button
                onClick={() => setShowAll(s => !s)}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  fontSize: 13, fontFamily: "'IBM Plex Mono', monospace",
                  color: 'var(--primary)', cursor: 'pointer',
                  fontWeight: 600, letterSpacing: '.02em',
                  textDecoration: 'underline', textUnderlineOffset: 3,
                }}
              >
                {showAll
                  ? '▲ Show top 5 only'
                  : `▼ Show all ${recipients.length} awardees`}
              </button>
            </div>
          )}

          {/* Pricing range */}
          {summary.min_amount != null && (
            <>
              {sectionLbl('Pricing Range')}
              <div style={{
                display: 'flex', gap: 20,
                fontFamily: "'IBM Plex Mono', monospace", fontSize: 14,
              }}>
                <span><span style={{ color: 'var(--ink-fade)' }}>min </span>{fmt(summary.min_amount)}</span>
                <span><span style={{ color: 'var(--ink-fade)' }}>avg </span>{fmt(summary.avg_amount)}</span>
                <span><span style={{ color: 'var(--ink-fade)' }}>max </span>{fmt(summary.max_amount)}</span>
              </div>
            </>
          )}

          {/* Canned questions */}
          {sectionLbl('Intelligence Queries')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {questions.map(q => (
              <div key={q.id}>
                <button
                  onClick={() => setActiveQuestion(activeQuestion === q.id ? null : q.id)}
                  style={{
                    background: activeQuestion === q.id ? 'var(--primary-soft)' : 'var(--paper)',
                    border: `1px solid ${activeQuestion === q.id ? 'var(--primary)' : 'var(--rule-strong)'}`,
                    borderRadius: 3, padding: '6px 12px',
                    fontSize: 13, fontFamily: "'IBM Plex Mono', monospace",
                    color: activeQuestion === q.id ? 'var(--primary)' : 'var(--ink)',
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                    letterSpacing: '.02em',
                  }}
                >
                  {activeQuestion === q.id ? '▾ ' : '▸ '}{q.label}
                </button>
                {activeQuestion === q.id && (
                  <div style={{
                    fontSize: 15, lineHeight: 1.7, color: 'var(--ink)',
                    padding: '10px 12px',
                    background: 'var(--primary-soft)',
                    borderLeft: '2px solid var(--primary)',
                    marginTop: 2, borderRadius: '0 3px 3px 0',
                  }}>
                    {q.answer}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* CO note */}
          <div style={{
            marginTop: 14, fontSize: 12, color: 'var(--ink-light)',
            fontFamily: "'IBM Plex Mono', monospace", fontStyle: 'italic',
          }}>
            Confirm incumbent with contracting officer before pursuit decision.
          </div>

        </div>
      )}
    </div>
  )
}
