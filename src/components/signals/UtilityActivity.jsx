/**
 * UtilityActivity
 * ===============
 * "Other activity at this utility" — the utility's other signals across
 * lanes (board meetings, regulatory proceedings, procurements), newest
 * first. For investor-owned utilities it rolls up the parent brand in the
 * same state (e.g. NSTAR Electric + NSTAR Gas + Eversource Gas -> Eversource).
 *
 * Tenant-scoped: only signals this tenant's OIPs matched (oip_signals is
 * restricted by RLS), so the list stays relevant and private.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { displaySource } from '../../lib/displaySource'
import { laneOf, LANE_LABELS, prettyUtilityName } from '../../lib/utilityLinks'

const SHOW = 10

const LANE_STYLE = {
  regulatory:  { bg: '#dbeafe', color: '#1e40af' },
  board:       { bg: '#ede9fe', color: '#5b21b6' },
  procurement: { bg: '#dcfce7', color: '#166534' },
}

function fmt(d) {
  if (!d) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
  const dt = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(d)
  return isNaN(dt) ? '' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function UtilityActivity({ sig }) {
  const [state, setState] = useState({ loading: true, utility: null, items: [] })
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let alive = true
    async function run() {
      if (!sig?.id) { setState({ loading: false, utility: null, items: [] }); return }
      // 1. This signal's utilities
      const { data: mine } = await supabase
        .from('signal_utilities')
        .select('utility_id, utilities:utility_id (id, name, parent_brand, ownership_type, state)')
        .eq('signal_id', sig.id)
      const utils = (mine || []).map(r => r.utilities).filter(Boolean)
      if (!utils.length) { if (alive) setState({ loading: false, utility: null, items: [] }); return }

      // 2. Brand roll-up for investor-owned utilities (same state)
      const brand = utils.find(u => u.ownership_type === 'iou' && u.parent_brand)?.parent_brand || null
      let utilIds = utils.map(u => u.id)
      if (brand) {
        const { data: sibs } = await supabase
          .from('utilities').select('id').eq('parent_brand', brand).eq('state', utils[0].state)
        utilIds = [...new Set([...utilIds, ...(sibs || []).map(s => s.id)])]
      }

      // 3. Other signals at those utilities
      const { data: links } = await supabase
        .from('signal_utilities').select('signal_id').in('utility_id', utilIds).limit(500)
      const otherIds = [...new Set((links || []).map(l => l.signal_id))].filter(id => id !== sig.id)
      if (!otherIds.length) { if (alive) setState({ loading: false, utility: { utils, brand }, items: [] }); return }

      // 4. Tenant scope + details
      const visible = new Set()
      for (let i = 0; i < otherIds.length; i += 100) {
        const { data } = await supabase.from('oip_signals').select('signal_id').in('signal_id', otherIds.slice(i, i + 100))
        ;(data || []).forEach(d => visible.add(d.signal_id))
      }
      const ids = [...visible]
      let rows = []
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabase
          .from('signals')
          .select('id, title, source, source_name, doc_type, doc_url, meeting_date, metadata, state')
          .in('id', ids.slice(i, i + 100))
        rows = rows.concat(data || [])
      }
      rows.sort((a, b) => String(b.meeting_date || '').localeCompare(String(a.meeting_date || '')))
      if (alive) setState({ loading: false, utility: { utils, brand }, items: rows })
    }
    run().catch(() => alive && setState({ loading: false, utility: null, items: [] }))
    return () => { alive = false }
  }, [sig?.id])

  if (state.loading || !state.utility || !state.items.length) return null

  const { utils, brand } = state.utility
  const heading = brand
    ? `${brand} (${utils[0].state})`
    : prettyUtilityName(utils[0].name)
  const thisLane = laneOf(sig)
  const crossLane = state.items.filter(r => laneOf(r) !== thisLane).length
  const list = expanded ? state.items : state.items.slice(0, SHOW)

  return (
    <div style={{ margin: '20px 0 24px' }}>
      <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--ink-fade)',
        textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
        Other activity at {heading}
        <span style={{ textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}>
          · {state.items.length} signal{state.items.length === 1 ? '' : 's'}
          {crossLane > 0 && ` · ${crossLane} in another channel`}
        </span>
      </div>
      <div style={{ borderLeft: '2px solid var(--rule-strong, #cbd5e1)', paddingLeft: 14 }}>
        {list.map(r => {
          const lane = laneOf(r)
          const st = LANE_STYLE[lane] || LANE_STYLE.procurement
          const title = String(r.title || '').replace(new RegExp(`^${(r.source_name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} — `), '')
          return (
            <div key={r.id} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--ink-fade)',
                display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span>{fmt(r.meeting_date)}</span>
                <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                  background: st.bg, color: st.color, letterSpacing: '.04em' }}>{LANE_LABELS[lane]}</span>
                <span>{displaySource(r)}</span>
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.4, marginTop: 2 }}>
                {title.length > 140 ? title.slice(0, 140) + '…' : title}
                {r.doc_url && (
                  <a href={r.doc_url} target="_blank" rel="noopener noreferrer"
                     style={{ marginLeft: 8, fontSize: 12, whiteSpace: 'nowrap' }}>Open document →</a>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {state.items.length > SHOW && (
        <button onClick={() => setExpanded(e => !e)} style={{ background: 'none', border: 'none', padding: 0,
          color: 'var(--primary)', cursor: 'pointer', fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}>
          {expanded ? 'Show fewer' : `Show all ${state.items.length}`}
        </button>
      )}
    </div>
  )
}
