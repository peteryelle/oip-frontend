/**
 * ProceedingDetails / DeadlineChip
 * ================================
 * Regulatory-signal enrichment, read from puc_docket_enrichment (one row per
 * docket, shared across tenants). Looked up by the signal's state and
 * metadata.proceeding_number.
 *
 *  - <ProceedingDetails sig={sig} />  drawer section: summary, proposal,
 *    who/what is affected, key dates with days remaining, related dockets,
 *    hearing officer, links to the source notice / filing.
 *  - <DeadlineChip sig={sig} />       card chip: nearest upcoming date.
 *
 * Dates whose source text names a different weekday than the date carry a
 * caution marker (the filing itself is inconsistent — confirm on the notice).
 * Company counsel is stored but intentionally not shown.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// ── Data: one fetch per docket, shared across every card and drawer ──────
const cache = new Map()      // key -> row | null
const inflight = new Map()   // key -> Promise

function docketKey(sig) {
  const state = sig?.state
  const number = (sig?.metadata?.proceeding_number || '').trim().toUpperCase()
  return state && number ? `${state}|${number}` : null
}

function fetchEnrichment(key) {
  if (cache.has(key)) return Promise.resolve(cache.get(key))
  if (inflight.has(key)) return inflight.get(key)
  const [state, number] = key.split('|')
  const p = supabase
    .from('puc_docket_enrichment')
    .select('docket_number, docket_title, status, summary, key_dates, extracted, source_filings, enriched_at')
    .eq('state', state)
    .eq('docket_number', number)
    .maybeSingle()
    .then(({ data, error }) => {
      const row = !error && data && data.status === 'ok' ? data : null
      cache.set(key, row)
      inflight.delete(key)
      return row
    })
    .catch(() => { inflight.delete(key); cache.set(key, null); return null })
  inflight.set(key, p)
  return p
}

export function useDocketEnrichment(sig) {
  const key = sig?.source === 'puc' ? docketKey(sig) : null
  const [row, setRow] = useState(() => (key && cache.has(key) ? cache.get(key) : null))
  useEffect(() => {
    let alive = true
    if (!key) { setRow(null); return }
    fetchEnrichment(key).then(r => { if (alive) setRow(r) })
    return () => { alive = false }
  }, [key])
  return row
}

// ── Date helpers (calendar dates, local midnight) ────────────────────────
const DATE_LABELS = {
  comment_deadline:      'Comments due',
  intervention_deadline: 'Intervene by',
  public_hearing:        'Public hearing',
  evidentiary_hearing:   'Evidentiary hearing',
  effective_date:        'Effective',
  implementation_date:   'Implementation',
  filed:                 'Filed',
}
// Dates a seller can act on, in chip priority order (nearest wins).
const ACTIONABLE = ['comment_deadline', 'intervention_deadline', 'public_hearing',
                    'evidentiary_hearing', 'effective_date', 'implementation_date']

function parseISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

function daysFromToday(d) {
  const t = new Date()
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate())
  return Math.round((d - today) / 86400000)
}

function fmtDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function relLabel(n) {
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n > 1) return `in ${n} days`
  if (n === -1) return 'yesterday'
  return `${-n} days ago`
}

function datedItems(keyDates) {
  return Object.entries(keyDates || {})
    .filter(([k, v]) => v && v.date && DATE_LABELS[k])
    .map(([k, v]) => ({ field: k, label: DATE_LABELS[k], date: parseISO(v.date), raw: v }))
    .filter(x => x.date)
    .sort((a, b) => a.date - b.date)
}

function caution(raw, date) {
  if (!raw?.weekday_conflict) return null
  const m = /source says (\w+)/i.exec(raw.weekday_conflict)
  const said = m ? m[1] : 'a different weekday'
  const actual = date.toLocaleDateString('en-US', { weekday: 'long' })
  return `The notice lists ${said}, but this date is a ${actual}. Confirm on the notice.`
}

// ── Card chip ────────────────────────────────────────────────────────────
export function DeadlineChip({ sig }) {
  const row = useDocketEnrichment(sig)
  if (!row) return null
  const upcoming = datedItems(row.key_dates)
    .filter(x => ACTIONABLE.includes(x.field) && daysFromToday(x.date) >= 0)
  if (!upcoming.length) return null
  const next = upcoming[0]
  const n = daysFromToday(next.date)
  const urgent = n <= 7 && next.field !== 'effective_date' && next.field !== 'implementation_date'
  const warn = caution(next.raw, next.date)
  const short = next.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return (
    <span title={warn || `${next.label} ${fmtDate(next.date)} (${relLabel(n)})`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 3, fontSize: 11, fontWeight: 600,
      fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.04em', textTransform: 'none',
      background: urgent ? '#fef3c7' : 'var(--paper-alt, #f1f5f9)',
      color: urgent ? '#92400e' : 'var(--ink-light)',
      border: '1px solid ' + (urgent ? '#f59e0b55' : 'var(--rule-strong, #cbd5e1)'),
      whiteSpace: 'nowrap',
    }}>
      {warn && <span aria-label="date needs confirmation">⚠</span>}
      {next.label} {short}
    </span>
  )
}

function docLabel(d) {
  const name = String(d.attachment || '').toLowerCase()
  if (d.type === 'Notice') {
    // "Order of Notice" alone is publication instructions; a combined
    // "Notice and Order of Notice" PDF is the notice itself.
    const orderOnly = name.includes('order of notice') && !name.includes('notice and order')
    return orderOnly ? 'Order of notice' : 'Read the notice'
  }
  if (d.type === 'Initial Filing') return 'Read the filing'
  if (d.type === 'Final Decision') return 'Read the final decision'
  if (d.type === 'Order') return 'Read the order'
  return `Read the ${String(d.type || 'document').toLowerCase()}`
}

// ── Drawer section ───────────────────────────────────────────────────────
const label = {
  fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--ink-fade)',
  textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6,
}

export default function ProceedingDetails({ sig }) {
  const row = useDocketEnrichment(sig)
  if (!row) return null
  const ex = row.extracted || {}
  const dates = datedItems(row.key_dates)
  const docs = (row.source_filings || []).filter(d => d.url)
  const affected = [
    ...(ex.customer_classes || []).map(c => c.charAt(0).toUpperCase() + c.slice(1)),
  ]
  const programs = (ex.rates_or_programs || []).slice(0, 8)
  const related = (ex.related_dockets || []).filter(
    r => r.replace(/\s+/g, '').toUpperCase().indexOf(row.docket_number) === -1)

  return (
    <div style={{
      margin: '20px 0 24px', padding: '18px 20px',
      border: '1px solid var(--rule-strong, #cbd5e1)', borderRadius: 6,
      background: 'var(--paper-alt, #f8fafc)',
    }}>
      <div style={{ ...label, marginBottom: 10 }}>Proceeding details</div>

      {row.summary && (
        <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--ink)', margin: '0 0 10px' }}>{row.summary}</p>
      )}
      {ex.proposal && ex.proposal !== row.summary && (
        <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ink-light)', margin: '0 0 14px' }}>
          <strong style={{ color: 'var(--ink)' }}>Proposed: </strong>{ex.proposal}
        </p>
      )}

      {dates.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={label}>Key dates</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 16, rowGap: 6 }}>
            {dates.map(d => {
              const n = daysFromToday(d.date)
              const past = n < 0
              const warn = caution(d.raw, d.date)
              const extra = [d.raw.time, d.raw.format].filter(Boolean).join(', ')
              return (
                <div key={d.field} style={{ display: 'contents' }}>
                  <div style={{ fontSize: 13, color: past ? 'var(--ink-fade)' : 'var(--ink-light)' }}>{d.label}</div>
                  <div style={{ fontSize: 13, color: past ? 'var(--ink-fade)' : 'var(--ink)' }}
                       title={d.raw.phrase ? `From the filing: "${d.raw.phrase}"` : undefined}>
                    <span style={{ fontWeight: past ? 400 : 600 }}>{fmtDate(d.date)}</span>
                    {extra && <span> · {extra}</span>}
                    <span style={{ marginLeft: 8, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
                      color: past ? 'var(--ink-fade)' : (n <= 7 ? '#b45309' : 'var(--ink-fade)') }}>
                      {relLabel(n)}
                    </span>
                    {warn && (
                      <div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>⚠ {warn}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {(affected.length > 0 || programs.length > 0) && (
        <div style={{ marginBottom: 14 }}>
          <div style={label}>Affects</div>
          <div style={{ fontSize: 13, color: 'var(--ink-light)', lineHeight: 1.6 }}>
            {affected.length > 0 && <div>{affected.join(' · ')}</div>}
            {programs.length > 0 && <div>{programs.join(' · ')}</div>}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, fontSize: 13, color: 'var(--ink-light)' }}>
        {related.length > 0 && (
          <div>
            <div style={label}>Related proceedings</div>
            {related.slice(0, 8).join(', ')}
          </div>
        )}
        {ex.hearing_officer && (
          <div>
            <div style={label}>Hearing officer</div>
            {ex.hearing_officer}
          </div>
        )}
        {docs.length > 0 && (
          <div>
            <div style={label}>Source documents</div>
            {docs.map((d, i) => (
              <div key={i}>
                <a href={d.url} target="_blank" rel="noopener noreferrer">
                  {docLabel(d)}
                </a>
                {d.filed_date && <span style={{ color: 'var(--ink-fade)' }}> · {d.filed_date}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
