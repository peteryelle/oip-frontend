// src/components/radar/PipelineRadar.jsx
import React, { useState, useMemo } from 'react'
import { useRadar }      from '../../hooks/useRadar'
import RadarBucketPanel  from './RadarBucketPanel'
import RadarDrawer       from './RadarDrawer'

const fmt = new Intl.NumberFormat('en-US', {
  style:                'currency',
  currency:             'USD',
  notation:             'compact',
  maximumFractionDigits: 1
})

const BUCKETS = [
  { key: '0-9mo',  label: 'Bid Alert',       sublabel: 'RFP imminent or live',                urgency: 'alert'  },
  { key: '9-18mo', label: 'Active Pursuit',   sublabel: 'Sources Sought active, RFP incoming', urgency: 'active' },
  { key: '18mo+',  label: 'Early Position',   sublabel: 'Relationship and positioning window', urgency: 'early'  },
]

export default function PipelineRadar({ supabase, oipId }) {
  const { signals, config, loading, error } = useRadar(supabase, oipId)

  const [scoreMin,     setScoreMin]     = useState(0)
  const [scoreMax,     setScoreMax]     = useState(100)
  const [activeSignal, setActiveSignal] = useState(null)

  const filtered = useMemo(() => {
    return signals.filter(s => {
      const h = s.incumbent_health
      if (h === null || h === undefined) return true
      return h >= scoreMin && h <= scoreMax
    })
  }, [signals, scoreMin, scoreMax])

  const byBucket = useMemo(() => {
    const map = {}
    BUCKETS.forEach(b => { map[b.key] = [] })
    filtered.forEach(s => {
      if (map[s.pop_bucket]) map[s.pop_bucket].push(s)
    })
    return map
  }, [filtered])

  const totalValue = filtered.reduce((s, r) => s + (r.award_amount || 0), 0)

  if (loading) return (
    <div style={{
      padding:    '48px 0',
      textAlign:  'center',
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize:   18,
      color:      'var(--ink-fade)'
    }}>
      Loading pipeline…
    </div>
  )

  if (error) return (
    <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 18, color: '#a01818' }}>
      Error: {error}
    </div>
  )

  return (
    <div>

      {/* Page header */}
      <div className="hero" style={{ marginBottom: 28 }}>
        <div className="hero-eyebrow">Federal Recompete Intelligence</div>
        <h1 className="hero-title">Pipeline Radar</h1>
        <p className="hero-sub">
          Federal contracts expiring within {config?.pop_horizon_months ?? 36} months — scored by incumbent health
        </p>
      </div>

      {/* Config params strip */}
      {config && (
        <div style={{
          display:      'flex',
          flexWrap:     'wrap',
          gap:          10,
          marginBottom: 28,
          padding:      '18px 22px',
          background:   'var(--paper)',
          border:       '1px solid var(--rule)',
          borderRadius: 4
        }}>
          <ConfigTag label="Award Range" value={`${fmt.format(config.min_award_value)} – ${fmt.format(config.max_award_value)}`} />
          <ConfigTag label="Scope"       value={config.geographic_scope} />
          {config.psc_codes?.length > 0 && (
            <ConfigTag label="PSC" value={config.psc_codes.join(', ')} />
          )}
          {config.set_aside_flags?.length > 0 && (
            <ConfigTag label="Set-Aside" value={config.set_aside_flags.join(', ')} />
          )}
          <ConfigTag label="Horizon" value={`${config.pop_horizon_months} months`} />
        </div>
      )}

      {/* Summary + score filter */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        flexWrap:       'wrap',
        gap:            16,
        marginBottom:   24
      }}>
        <div style={{
          display:      'flex',
          gap:          40,
          padding:      '20px 28px',
          background:   'var(--paper)',
          border:       '1px solid var(--rule)',
          borderRadius: 4
        }}>
          <Stat label="Contracts"      value={filtered.length} />
          <Stat label="Pipeline Value" value={fmt.format(totalValue)} />
        </div>

        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          12,
          padding:      '16px 22px',
          background:   'var(--paper)',
          border:       '1px solid var(--rule)',
          borderRadius: 4
        }}>
          <span style={{
            fontFamily:    "'IBM Plex Mono', monospace",
            fontSize:      15,
            fontWeight:    600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color:         'var(--ink-fade)'
          }}>
            Health Score
          </span>
          <input type="number" min={0} max={100} value={scoreMin}
            onChange={e => setScoreMin(Number(e.target.value))} style={inputStyle} />
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 17, color: 'var(--ink-fade)' }}>–</span>
          <input type="number" min={0} max={100} value={scoreMax}
            onChange={e => setScoreMax(Number(e.target.value))} style={inputStyle} />
          {(scoreMin > 0 || scoreMax < 100) && (
            <button onClick={() => { setScoreMin(0); setScoreMax(100) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-fade)', fontSize: 22, lineHeight: 1, padding: 0 }}>
              ×
            </button>
          )}
        </div>
      </div>

      {/* Bucket panels — Early Position first (longest runway) */}
      {[...BUCKETS].reverse().map(bucket => (
        <RadarBucketPanel
          key={bucket.key}
          title={bucket.label}
          sublabel={bucket.sublabel}
          urgency={bucket.urgency}
          signals={byBucket[bucket.key] || []}
          onScoreClick={setActiveSignal}
        />
      ))}

      {filtered.length === 0 && !loading && (
        <div style={{
          textAlign: 'center', padding: '48px 24px', fontSize: 18,
          color: 'var(--ink-fade)', fontStyle: 'italic',
          background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 4
        }}>
          No contracts match the current filter.
        </div>
      )}

      {activeSignal && (
        <RadarDrawer signal={activeSignal} onClose={() => setActiveSignal(null)} />
      )}
    </div>
  )
}

function ConfigTag({ label, value }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 16px', background: 'var(--bg)',
      border: '1px solid var(--rule)', borderRadius: 2
    }}>
      <span style={{
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-fade)'
      }}>
        {label}
      </span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, color: 'var(--ink)', fontWeight: 600 }}>
        {value}
      </span>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600,
        letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-fade)', marginBottom: 8
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 34, fontWeight: 500,
        color: 'var(--ink)', letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums'
      }}>
        {value}
      </div>
    </div>
  )
}

const inputStyle = {
  width: 68, padding: '8px 10px', background: 'var(--bg)',
  border: '1px solid var(--rule-strong)', borderRadius: 3,
  color: 'var(--ink)', fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 17, textAlign: 'center'
}
