/**
 * MultiVerticalSignalList
 * =======================
 * Unified signal list showing signals across all tenant OIPs in one view.
 * Adds a Source column with vertical badge (OE-417, Grants, PUC, SAM, SLED).
 *
 * Used by MarketReviewPage when the tenant has multiple verticals.
 * Existing SLED and SAM render paths are unchanged.
 *
 * Props:
 *   signals       — from useMultiVerticalSignals()
 *   loading       — bool
 *   onSignalClick — (oipSignal) => void — opens SignalDrawer
 *   onStatusChange— (signalId, oipId, newStatus) => void
 */

import { useState } from 'react'
import SignalSourceBadge from './SignalSourceBadge'

const TIER_CONFIG = {
  tier1_strong: { label: 'Strong',  bg: '#dcfce7', color: '#166534' },
  tier1:        { label: 'Tier 1',  bg: '#dbeafe', color: '#1e40af' },
  tier2:        { label: 'Tier 2',  bg: '#f1f5f9', color: '#475569' },
}

function TierBadge({ tier }) {
  const cfg = TIER_CONFIG[tier] || { label: tier, bg: '#f1f5f9', color: '#475569' }
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 3,
      fontSize: 12, fontWeight: 700,
      fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.08em',
      background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  )
}

function formatDate(str) {
  if (!str) return '—'
  try { return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return str }
}

export default function MultiVerticalSignalList({
  signals = [],
  loading = false,
  onSignalClick,
  onStatusChange,
}) {
  const [tierFilter,   setTierFilter]   = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('new')
  const [search,       setSearch]       = useState('')

  // Derive unique vertical slugs for filter dropdown
  const verticals = [...new Set(
    signals.map(s => s.oips?.verticals?.slug).filter(Boolean)
  )].sort()

  const filtered = signals.filter(s => {
    const vSlug = s.oips?.verticals?.slug || ''
    if (tierFilter   && s.signal_tier !== tierFilter) return false
    if (sourceFilter && vSlug !== sourceFilter) return false
    if (statusFilter && s.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const t = (s.signals?.title || '').toLowerCase()
      const n = (s.signals?.source_name || '').toLowerCase()
      if (!t.includes(q) && !n.includes(q)) return false
    }
    return true
  })

  // Summary counts by vertical
  const countByVertical = signals.reduce((acc, s) => {
    const v = s.oips?.verticals?.slug || 'unknown'
    acc[v] = (acc[v] || 0) + 1
    return acc
  }, {})

  if (loading) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center',
        color: 'var(--ink-fade)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>
        Loading signals…
      </div>
    )
  }

  return (
    <div>
      {/* Source summary strip */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 20,
        flexWrap: 'wrap', alignItems: 'center',
      }}>
        {Object.entries(countByVertical).map(([slug, count]) => (
          <button
            key={slug}
            onClick={() => setSourceFilter(s => s === slug ? '' : slug)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 4,
              border: sourceFilter === slug
                ? '1.5px solid var(--primary)'
                : '1.5px solid var(--rule)',
              background: sourceFilter === slug ? 'var(--primary-light, #eff6ff)' : 'var(--paper)',
              cursor: 'pointer', fontSize: 13,
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            <SignalSourceBadge verticalSlug={slug} />
            <span style={{ color: 'var(--ink-fade)' }}>{count}</span>
          </button>
        ))}
        {sourceFilter && (
          <button onClick={() => setSourceFilter('')}
            style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--ink-fade)', textDecoration: 'underline' }}>
            Clear filter
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="new">New</option>
          <option value="reviewed">Reviewed</option>
          <option value="pursuing">Pursuing</option>
          <option value="dismissed">Dismissed</option>
          <option value="">All statuses</option>
        </select>
        <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}>
          <option value="">All tiers</option>
          <option value="tier1_strong">Strong</option>
          <option value="tier1">Tier 1</option>
          <option value="tier2">Tier 2</option>
        </select>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
          <option value="">All sources</option>
          {verticals.map(v => <option key={v} value={v}>{v.toUpperCase()}</option>)}
        </select>
        <input
          type="search"
          placeholder="Search title or source…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ minWidth: 220 }}
        />
      </div>

      {/* Count */}
      <div style={{
        marginBottom: 12, fontSize: 13,
        color: 'var(--ink-fade)', fontFamily: "'IBM Plex Mono', monospace",
      }}>
        {filtered.length} signal{filtered.length !== 1 ? 's' : ''}
        {filtered.length !== signals.length && ` of ${signals.length}`}
      </div>

      {/* Signal list */}
      {filtered.length === 0 ? (
        <div style={{
          padding: '48px 24px', textAlign: 'center', border: '1px solid var(--rule)',
          borderRadius: 6, color: 'var(--ink-fade)',
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 13,
        }}>
          No signals match your filters.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(s => {
            const sig     = s.signals || {}
            const vSlug   = s.oips?.verticals?.slug || ''
            const oipName = s.oips?.name || ''
            const date    = sig.meeting_date || sig.scraped_at || s.scored_at

            return (
              <div
                key={`${s.oip_id}:${s.signal_id}`}
                onClick={() => onSignalClick && onSignalClick(s)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 80px 1fr auto',
                  gap: 12,
                  alignItems: 'center',
                  padding: '14px 18px',
                  background: 'var(--paper)',
                  border: '1px solid var(--rule)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  transition: 'border-color .15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--rule-strong)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--rule)'}
              >
                {/* Source badge */}
                <div>
                  <SignalSourceBadge verticalSlug={vSlug} />
                </div>

                {/* Tier badge */}
                <div>
                  <TierBadge tier={s.signal_tier} />
                </div>

                {/* Title + source name + reason */}
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontFamily: "'Spectral', Georgia, serif",
                    fontSize: 18, fontWeight: 600,
                    color: 'var(--ink)', lineHeight: 1.3,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {sig.title || s.text_excerpt?.substring(0, 80) || '(untitled)'}
                  </div>
                  <div style={{
                    fontSize: 13, color: 'var(--ink-fade)',
                    fontFamily: "'IBM Plex Mono', monospace",
                    marginTop: 4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {sig.source_name}
                    {oipName && <span style={{ marginLeft: 8, opacity: .6 }}>· {oipName}</span>}
                  </div>
                  {s.match_reason && (
                    <div style={{
                      fontSize: 13, color: 'var(--ink-light)',
                      marginTop: 5, lineHeight: 1.5,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      {s.match_reason}
                    </div>
                  )}
                </div>

                {/* Date */}
                <div style={{
                  fontSize: 13, color: 'var(--ink-fade)',
                  fontFamily: "'IBM Plex Mono', monospace",
                  whiteSpace: 'nowrap', textAlign: 'right',
                }}>
                  {formatDate(date)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
