import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useOip } from '../../lib/oip'
import { PURSUED_STAGES } from '../pursued/PursuedTab'
import './trades.css'

// ─── helpers ────────────────────────────────────────────────────────────────

const GOOD = new Set(['tier1_strong', 'tier1'])
const MAYBE = new Set(['tier2'])

function fitOf(tier) {
  if (GOOD.has(tier)) return 'good'
  if (MAYBE.has(tier)) return 'maybe'
  return null
}

function parseLocalDate(s) {
  if (!s || typeof s !== 'string') return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function startOfToday() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d
}

function daysUntil(d) {
  return Math.round((d - startOfToday()) / 86400000)
}

function fmtDue(d) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function bidKind(title) {
  return /sub[\s-]?bids?/i.test(title || '') ? 'Filed sub-bid' : null
}

// COMMBUYS "excerpts" often just restate the title, bid number and organization.
// Show the box only when real scope text is left after removing those.
function usefulExcerpt(item) {
  if (!item.excerpt) return null
  let rest = item.excerpt
  for (const part of [item.title, item.bidNumber, item.org]) {
    if (part) rest = rest.split(part).join(' ')
  }
  rest = rest.replace(/bid solicitation\s*#?:?|organization:?/gi, ' ').replace(/[\s.,:;#-]+/g, ' ').trim()
  return rest.length >= 40 ? item.excerpt : null
}

function isBoardSource(s) {
  const src = `${s?.source_name || ''} ${s?.source || ''} ${s?.metadata?.platform || ''}`.toLowerCase()
  return src.includes('boarddocs') || src.includes('legistar') || src.includes('board')
}

function toItem(row) {
  const s = row.signals || {}
  const meta = s.metadata || {}
  const due = parseLocalDate(meta.opening_date || meta.due_date || meta.response_deadline)
  return {
    oipId: row.oip_id,
    signalId: row.signal_id,
    row,
    title: s.title || 'Untitled',
    org: meta.organization || meta.agency || s.source_name || '',
    buyer: meta.buyer || null,
    bidNumber: meta.bid_number || meta.alternate_id || null,
    docUrl: s.doc_url || null,
    due,
    meetingDate: parseLocalDate(s.meeting_date),
    fit: fitOf(row.signal_tier),
    status: row.status || 'new',
    excerpt: row.text_excerpt || null,
    board: isBoardSource(s),
    kind: bidKind(s.title),
  }
}

// ─── icons ──────────────────────────────────────────────────────────────────

const Icon = {
  bids: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 3h6v3H9z" /><path d="M9 12h6M9 16h4" /></>,
  coming: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  jobs: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5h6v2M3 13h18" /></>,
  shop: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
}

function Svg({ children, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
  )
}

// ─── app shell ──────────────────────────────────────────────────────────────

export default function TradesApp() {
  const { user, signOut } = useAuth()
  const { oips, selectedOip } = useOip()
  const tenantId = selectedOip?.tenant_id || null
  const tenantName = selectedOip?.tenants?.name || ''
  const oipIds = useMemo(
    () => oips.filter(o => o.tenant_id === tenantId).map(o => o.id),
    [oips, tenantId]
  )

  const [tab, setTab] = useState('bids')
  const [openItem, setOpenItem] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!oipIds.length) { setItems([]); setLoading(false); return }
    setLoading(true); setError(null)
    const { data, error: e } = await supabase
      .from('oip_signals')
      .select(`
        oip_id, signal_id, signal_tier, signal_value, status, relevance_status,
        match_reason, matched_keywords, matched_groups, text_excerpt,
        signals:signal_id (id, title, source_name, source, state, meeting_date, scraped_at,
                           metadata, signal_kind, doc_url, portal_id)
      `)
      .in('oip_id', oipIds)
      .eq('relevance_status', 'active')
      .limit(2500)
    if (e) { setError('Bids could not load. Pull down or reopen the app to try again.'); setLoading(false); return }
    setItems((data || []).filter(r => r.signals && r.signals.signal_kind !== 'award').map(toItem))
    setLoading(false)
  }, [oipIds])

  useEffect(() => { load() }, [load])

  const setStatus = async (item, status) => {
    setItems(prev => prev.map(i => (i.signalId === item.signalId && i.oipId === item.oipId ? { ...i, status } : i)))
    const { error: e } = await supabase
      .from('oip_signals')
      .update({ status })
      .eq('oip_id', item.oipId)
      .eq('signal_id', item.signalId)
    if (e) {
      setItems(prev => prev.map(i => (i.signalId === item.signalId && i.oipId === item.oipId ? { ...i, status: item.status } : i)))
      alert('Could not update this job: ' + e.message)
    }
  }

  const pursue = async (item) => {
    const s = item.row.signals || {}
    const snapshot = {
      title: s.title, source_name: s.source_name, state: s.state, doc_url: s.doc_url,
      portal_id: s.portal_id, meeting_date: s.meeting_date, scraped_at: s.scraped_at,
      matched_keywords: item.row.matched_keywords, matched_groups: item.row.matched_groups,
      signal_tier: item.row.signal_tier, text_excerpt: item.row.text_excerpt,
    }
    const { error: e } = await supabase.from('pursued_signals').insert({
      oip_id: item.oipId, signal_id: item.signalId, snapshot, pipeline_stage: PURSUED_STAGES[0],
    })
    if (e) { alert('Could not add to My jobs: ' + e.message); return false }
    await setStatus(item, 'pursuing')
    return true
  }

  if (openItem) {
    return (
      <div className="tq">
        <JobDetail
          item={openItem}
          onBack={() => setOpenItem(null)}
          onPass={async () => { await setStatus(openItem, 'dismissed'); setOpenItem(null) }}
          onSave={async () => { await setStatus(openItem, 'reviewed'); setOpenItem(null) }}
          onBid={async () => { if (await pursue(openItem)) { setOpenItem(null); setTab('jobs') } }}
        />
      </div>
    )
  }

  return (
    <div className="tq">
      <div className="tq-screen">
        {tab === 'bids' && (
          <BidsScreen items={items} loading={loading} error={error} tenantName={tenantName}
            onOpen={setOpenItem}
            onPass={i => setStatus(i, 'dismissed')}
            onSave={i => setStatus(i, i.status === 'reviewed' ? 'new' : 'reviewed')} />
        )}
        {tab === 'coming' && (
          <ComingUpScreen items={items} loading={loading}
            onWatch={i => setStatus(i, i.status === 'reviewed' ? 'new' : 'reviewed')}
            onHide={i => setStatus(i, 'dismissed')} />
        )}
        {tab === 'jobs' && <MyJobsScreen oipIds={oipIds} userId={user?.id} />}
        {tab === 'shop' && <MyShopScreen tenantId={tenantId} email={user?.email} onSignOut={signOut} />}
      </div>
      <nav className="tq-tabs" aria-label="Main">
        {[
          ['bids', 'Bids', Icon.bids],
          ['coming', 'Coming up', Icon.coming],
          ['jobs', 'My jobs', Icon.jobs],
          ['shop', 'My shop', Icon.shop],
        ].map(([key, label, icon]) => (
          <button key={key} type="button" className={`tq-tab${tab === key ? ' is-on' : ''}`}
            aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>
            <Svg>{icon}</Svg>{label}
          </button>
        ))}
      </nav>
    </div>
  )
}

// ─── swipeable card ─────────────────────────────────────────────────────────

function SwipeCard({ onSwipeLeft, onSwipeRight, onTap, outlined, leftLabel = 'Pass', rightLabel = 'Save', rightOnLabel = 'Saved', rightOn = false, children }) {
  const start = useRef(null)
  const moved = useRef(false)
  const [dx, setDx] = useState(0)
  const THRESHOLD = 90

  const down = e => { start.current = e.clientX; moved.current = false }
  const move = e => {
    if (start.current == null) return
    const d = e.clientX - start.current
    if (Math.abs(d) > 8) moved.current = true
    setDx(d)
  }
  const up = () => {
    if (start.current == null) return
    const d = dx
    start.current = null
    setDx(0)
    if (d <= -THRESHOLD) onSwipeLeft?.()
    else if (d >= THRESHOLD) onSwipeRight?.()
    else if (!moved.current) onTap?.()
  }

  const hint = dx >= 40 ? 'right' : dx <= -40 ? 'left' : null
  return (
    <div className={`tq-swipe${hint ? ` hint-${hint}` : ''}`}>
      <div className="tq-swipe-under" aria-hidden="true">
        <span>Save</span><span>Pass</span>
      </div>
      <div
        className={`tq-card${outlined ? ' is-outlined' : ''}`}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? 'none' : undefined }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onKeyDown={e => {
          if (e.key === 'Enter') onTap?.()
          else if (e.key === 'ArrowLeft') { e.preventDefault(); onSwipeLeft?.() }
          else if (e.key === 'ArrowRight') { e.preventDefault(); onSwipeRight?.() }
        }}
        role="button" tabIndex={0}
      >
        {children}
        <div className="tq-card-actions">
          <button type="button" onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onSwipeLeft?.() }}>{leftLabel}</button>
          <button type="button" className={rightOn ? 'is-on' : ''} onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onSwipeRight?.() }}>{rightOn ? rightOnLabel : rightLabel}</button>
        </div>
      </div>
    </div>
  )
}

function FitChip({ fit }) {
  if (fit === 'good') return <span className="tq-fit tq-fit-good">Good fit</span>
  if (fit === 'maybe') return <span className="tq-fit tq-fit-maybe">Maybe</span>
  return null
}

// ─── Bids ───────────────────────────────────────────────────────────────────

function BidsScreen({ items, loading, error, tenantName, onOpen, onPass, onSave }) {
  const [filter, setFilter] = useState('all')
  const today = startOfToday()

  const open = useMemo(() => items
    .filter(i => i.due && i.due >= today && i.fit && i.status !== 'dismissed' && i.status !== 'pursuing')
    .sort((a, b) => a.due - b.due), [items]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = open.filter(i =>
    filter === 'good' ? i.fit === 'good' :
    filter === 'week' ? daysUntil(i.due) <= 7 :
    filter === 'saved' ? i.status === 'reviewed' : true)

  return (
    <>
      <header className="tq-head">
        <div className="tq-head-row">
          <h1>Bids</h1>
          {!loading && <span className="tq-count">{open.length} open</span>}
        </div>
        {tenantName && <p className="tq-sub">{tenantName}</p>}
      </header>
      <div className="tq-chips" role="group" aria-label="Filter bids">
        {[['all', 'All'], ['good', 'Good fit'], ['week', 'Due this week'], ['saved', 'Saved']].map(([k, l]) => (
          <button key={k} type="button" className={`tq-chip${filter === k ? ' is-on' : ''}`}
            aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      <p className="tq-hint">
        <span className="tq-touch-only">Swipe right to save, left to pass</span>
        <span className="tq-mouse-only">Use the buttons, or select a card and press ← to pass, → to save</span>
      </p>
      <main className="tq-list">
        {loading && <p className="tq-empty">Loading bids…</p>}
        {error && <p className="tq-empty">{error}</p>}
        {!loading && !error && shown.length === 0 && (
          <p className="tq-empty">
            {filter === 'all'
              ? 'No open bids right now. New bids are added after each weekly scan.'
              : 'Nothing matches this filter. Tap All to see every open bid.'}
          </p>
        )}
        {shown.map(i => {
          const d = daysUntil(i.due)
          return (
            <SwipeCard key={`${i.oipId}:${i.signalId}`} outlined={i.status === 'reviewed'} rightOn={i.status === 'reviewed'}
              onTap={() => onOpen(i)} onSwipeLeft={() => onPass(i)} onSwipeRight={() => onSave(i)}>
              <div className="tq-card-top">
                <FitChip fit={i.fit} />
                <span className={`tq-due${d <= 7 ? ' is-soon' : ''}`}>
                  {i.status === 'reviewed' ? 'Saved · ' : ''}{d === 0 ? 'Due today' : `Due ${fmtDue(i.due)}`}
                </span>
              </div>
              <span className="tq-title">{i.title}</span>
              <span className="tq-meta">{[i.org, i.kind].filter(Boolean).join(' · ')}</span>
            </SwipeCard>
          )
        })}
      </main>
    </>
  )
}

// ─── Job detail ─────────────────────────────────────────────────────────────

function JobDetail({ item, onBack, onPass, onSave, onBid }) {
  const [busy, setBusy] = useState(false)
  const run = fn => async () => { if (busy) return; setBusy(true); await fn(); setBusy(false) }
  const d = item.due ? daysUntil(item.due) : null
  const tiles = [
    item.due && ['Bid due', `${fmtDue(item.due)}${d != null && d <= 7 ? ` (${d === 0 ? 'today' : `${d} days`})` : ''}`, d != null && d <= 7],
    item.kind && ['How you bid', item.kind],
    item.bidNumber && ['Bid number', item.bidNumber],
    item.buyer && ['Buyer', item.buyer],
  ].filter(Boolean)

  return (
    <div className="tq-screen">
      <header className="tq-detail-head">
        <button type="button" className="tq-round" aria-label="Back to bids" onClick={onBack}><Svg size={20}>{Icon.back}</Svg></button>
        <FitChip fit={item.fit} />
      </header>
      <main className="tq-detail">
        <h1 className="tq-detail-title">{item.title}</h1>
        {item.org && <p className="tq-sub">{item.org}</p>}
        {tiles.length > 0 && (
          <div className="tq-tiles">
            {tiles.map(([label, value, soon]) => (
              <div key={label} className="tq-tile">
                <span className="tq-tile-label">{label}</span>
                <span className={`tq-tile-value${soon ? ' is-soon' : ''}`}>{value}</span>
              </div>
            ))}
          </div>
        )}
        {usefulExcerpt(item) && (
          <section className="tq-panel">
            <h2>The work</h2>
            <p>{usefulExcerpt(item)}</p>
          </section>
        )}
        {item.docUrl && (
          <a className="tq-link-row" href={item.docUrl} target="_blank" rel="noreferrer">Open bid documents</a>
        )}
        <div className="tq-quiet-actions">
          <button type="button" onClick={run(onPass)} disabled={busy}>Pass</button>
          <button type="button" onClick={run(onSave)} disabled={busy}>{item.status === 'reviewed' ? 'Saved' : 'Save'}</button>
        </div>
      </main>
      <div className="tq-actionbar">
        <button type="button" className="tq-btn-primary" onClick={run(onBid)} disabled={busy}>I'm bidding</button>
      </div>
    </div>
  )
}

// ─── Coming up ──────────────────────────────────────────────────────────────

function ComingUpScreen({ items, loading, onWatch, onHide }) {
  const list = useMemo(() => items
    .filter(i => !i.due && i.board && i.fit && i.status !== 'dismissed')
    .sort((a, b) => (b.meetingDate || 0) - (a.meetingDate || 0)), [items])

  return (
    <>
      <header className="tq-head">
        <div className="tq-head-row">
          <h1>Coming up</h1>
          {!loading && <span className="tq-count">{list.length} projects</span>}
        </div>
        <p className="tq-sub">Approved by a town or school board, not out to bid yet.</p>
      </header>
      <p className="tq-hint">
        <span className="tq-touch-only">Swipe right to watch, left to hide</span>
        <span className="tq-mouse-only">Use the buttons, or select a card and press ← to hide, → to watch</span>
      </p>
      <main className="tq-list">
        {loading && <p className="tq-empty">Loading…</p>}
        {!loading && list.length === 0 && (
          <p className="tq-empty">Nothing on the horizon yet. Projects show up here when a board approves work in your trade.</p>
        )}
        {list.map(i => (
          <SwipeCard key={`${i.oipId}:${i.signalId}`} outlined={i.status === 'reviewed'}
            leftLabel="Hide" rightLabel="Watch" rightOnLabel="Watching" rightOn={i.status === 'reviewed'}
            onSwipeRight={() => onWatch(i)} onSwipeLeft={() => onHide(i)}
            onTap={() => i.docUrl && window.open(i.docUrl, '_blank', 'noopener')}>
            <div className="tq-card-top">
              <FitChip fit={i.fit} />
              <span className="tq-due">
                {i.status === 'reviewed' ? 'Watching' : ''}
                {i.status === 'reviewed' && i.meetingDate ? ' · ' : ''}
                {i.meetingDate ? `Board ${fmtDue(i.meetingDate)}` : ''}
              </span>
            </div>
            <span className="tq-title">{i.title}</span>
            {i.org && <span className="tq-meta">{i.org}</span>}
          </SwipeCard>
        ))}
      </main>
    </>
  )
}

// ─── My jobs ────────────────────────────────────────────────────────────────

function MyJobsScreen({ oipIds, userId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!oipIds.length) { setRows([]); setLoading(false); return }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('pursued_signals')
        .select('id, oip_id, signal_id, snapshot, pipeline_stage, pursued_at')
        .in('oip_id', oipIds)
        .order('pursued_at', { ascending: false })
      if (!cancelled) { setRows(data || []); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [oipIds])

  const setStage = async (row, stage) => {
    const prev = row.pipeline_stage
    setRows(rs => rs.map(r => (r.id === row.id ? { ...r, pipeline_stage: stage } : r)))
    const { error } = await supabase.from('pursued_signals')
      .update({ pipeline_stage: stage, last_updated_at: new Date().toISOString(), last_updated_by: userId || null })
      .eq('id', row.id)
    if (error) {
      setRows(rs => rs.map(r => (r.id === row.id ? { ...r, pipeline_stage: prev } : r)))
      alert('Could not update the stage: ' + error.message)
    }
  }

  return (
    <>
      <header className="tq-head">
        <div className="tq-head-row">
          <h1>My jobs</h1>
          {!loading && <span className="tq-count">{rows.length}</span>}
        </div>
      </header>
      <main className="tq-list">
        {loading && <p className="tq-empty">Loading…</p>}
        {!loading && rows.length === 0 && (
          <p className="tq-empty">No jobs yet. Open a bid and tap I'm bidding to track it here.</p>
        )}
        {rows.map(r => {
          const stage = r.pipeline_stage || PURSUED_STAGES[0]
          return (
            <article key={r.id} className="tq-card tq-job">
              <span className="tq-title">{r.snapshot?.title || 'Untitled'}</span>
              <label className="tq-stage">
                <span>Stage</span>
                <select value={stage} onChange={e => setStage(r, e.target.value)}>
                  {PURSUED_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              {r.snapshot?.doc_url && (
                <a className="tq-inline-link" href={r.snapshot.doc_url} target="_blank" rel="noreferrer">Open bid documents</a>
              )}
            </article>
          )
        })}
      </main>
    </>
  )
}

// ─── My shop ────────────────────────────────────────────────────────────────

const EMPTY_SETTINGS = {
  home_base: '', service_radius_miles: 25, min_job_value: '', max_job_value: '',
  bid_role: 'both', prevailing_wage_ready: true,
  digest: { channel: 'email', cadence: 'weekly', push_strong_fit: true },
}

function MyShopScreen({ tenantId, email, onSignOut }) {
  const [trades, setTrades] = useState([])
  const [mine, setMine] = useState(new Set())
  const [primaryId, setPrimaryId] = useState(null)
  const [s, setS] = useState(EMPTY_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState(null)

  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [tp, tt, fs] = await Promise.all([
        supabase.from('trade_profiles').select('id, slug, name').eq('is_active', true).order('name'),
        supabase.from('tenant_trades').select('trade_id, is_primary').eq('tenant_id', tenantId),
        supabase.from('tenant_field_settings').select('*').eq('tenant_id', tenantId).maybeSingle(),
      ])
      if (cancelled) return
      setTrades(tp.data || [])
      setMine(new Set((tt.data || []).map(r => r.trade_id)))
      setPrimaryId((tt.data || []).find(r => r.is_primary)?.trade_id || null)
      if (fs.data) {
        setS({
          ...EMPTY_SETTINGS, ...fs.data,
          home_base: fs.data.home_base || '',
          min_job_value: fs.data.min_job_value ?? '',
          max_job_value: fs.data.max_job_value ?? '',
          digest: { ...EMPTY_SETTINGS.digest, ...(fs.data.digest || {}) },
        })
      }
      if (tp.error || tt.error || fs.error) setNote('Some settings could not load. Changes may not save.')
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [tenantId])

  const toggleTrade = async (trade) => {
    const has = mine.has(trade.id)
    if (has && trade.id === primaryId) { setNote('This is your main trade, so it stays on.'); return }
    const next = new Set(mine); has ? next.delete(trade.id) : next.add(trade.id)
    setMine(next)
    const { error } = has
      ? await supabase.from('tenant_trades').delete().eq('tenant_id', tenantId).eq('trade_id', trade.id)
      : await supabase.from('tenant_trades').insert({ tenant_id: tenantId, trade_id: trade.id, is_primary: false })
    if (error) { setMine(mine); setNote('Could not update trades: ' + error.message) }
    else setNote(null)
  }

  const save = async () => {
    setSaving(true); setNote(null)
    const num = v => (v === '' || v == null ? null : Number(String(v).replace(/[^0-9.]/g, '')) || null)
    const { error } = await supabase.from('tenant_field_settings').upsert({
      tenant_id: tenantId,
      home_base: s.home_base || null,
      service_radius_miles: Number(s.service_radius_miles) || null,
      min_job_value: num(s.min_job_value),
      max_job_value: num(s.max_job_value),
      bid_role: s.bid_role,
      prevailing_wage_ready: !!s.prevailing_wage_ready,
      digest: s.digest,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    setNote(error ? 'Could not save: ' + error.message : 'Changes saved.')
  }

  const set = (k, v) => setS(prev => ({ ...prev, [k]: v }))
  const setDigest = (k, v) => setS(prev => ({ ...prev, digest: { ...prev.digest, [k]: v } }))

  if (loading) return <><header className="tq-head"><h1>My shop</h1></header><p className="tq-empty">Loading…</p></>

  return (
    <>
      <header className="tq-head"><h1>My shop</h1></header>
      <main className="tq-list tq-shop">
        <section className="tq-panel">
          <h2>Trades I do</h2>
          <div className="tq-chips tq-chips-wrap">
            {trades.map(t => (
              <button key={t.id} type="button" className={`tq-chip${mine.has(t.id) ? ' is-on' : ''}`}
                aria-pressed={mine.has(t.id)} onClick={() => toggleTrade(t)}>{t.name}</button>
            ))}
          </div>
        </section>

        <section className="tq-panel">
          <div className="tq-row-between">
            <label htmlFor="tq-radius"><h2>How far I'll drive</h2></label>
            <span className="tq-strong">{s.service_radius_miles} mi</span>
          </div>
          <input id="tq-radius" type="range" min="5" max="100" step="5"
            value={s.service_radius_miles || 25} onChange={e => set('service_radius_miles', e.target.value)} />
          <label className="tq-field">From
            <input type="text" value={s.home_base} placeholder="Town, MA" onChange={e => set('home_base', e.target.value)} />
          </label>
        </section>

        <section className="tq-panel">
          <h2>Job size</h2>
          <div className="tq-two">
            <label className="tq-field">Smallest
              <input type="text" inputMode="numeric" value={s.min_job_value} placeholder="$" onChange={e => set('min_job_value', e.target.value)} />
            </label>
            <label className="tq-field">Largest
              <input type="text" inputMode="numeric" value={s.max_job_value} placeholder="$" onChange={e => set('max_job_value', e.target.value)} />
            </label>
          </div>
        </section>

        <section className="tq-panel">
          <h2>How I get work</h2>
          <div className="tq-seg" role="group" aria-label="How I get work">
            {[['prime', 'Bid direct'], ['sub', 'Sub to GC'], ['both', 'Both']].map(([k, l]) => (
              <button key={k} type="button" className={s.bid_role === k ? 'is-on' : ''}
                aria-pressed={s.bid_role === k} onClick={() => set('bid_role', k)}>{l}</button>
            ))}
          </div>
          <label className="tq-toggle">Prevailing-wage jobs OK
            <input type="checkbox" checked={!!s.prevailing_wage_ready} onChange={e => set('prevailing_wage_ready', e.target.checked)} />
          </label>
        </section>

        <section className="tq-panel">
          <label className="tq-toggle">Weekly email of new bids
            <input type="checkbox" checked={s.digest.cadence === 'weekly'} onChange={e => setDigest('cadence', e.target.checked ? 'weekly' : 'off')} />
          </label>
          <label className="tq-toggle">Alert me to good fits
            <input type="checkbox" checked={!!s.digest.push_strong_fit} onChange={e => setDigest('push_strong_fit', e.target.checked)} />
          </label>
        </section>

        {note && <p className="tq-note" role="status">{note}</p>}
        <button type="button" className="tq-btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>

        <section className="tq-account">
          <span>{email}</span>
          <button type="button" onClick={onSignOut}>Sign out</button>
        </section>
      </main>
    </>
  )
}
