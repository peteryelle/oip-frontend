// src/pages/CoLandscapePage.jsx
//
// Call-prep drilldown for a contracting officer. Route: /co-landscape
// Query params: ?agency=<name>&naics=<comma-separated codes>&co=<known CO name>
//
// This is a SIDE MODULE, not a change to App.jsx beyond the one import and
// one <Route> line needed to mount it -- see the App.jsx diff alongside this
// file. Everything else (data fetching, job queueing, rendering) lives here.
//
// Data flow, cache-first (this view never talks to GovCon directly):
//   1. Look up dd_co_landscape_cache by (agency, naics_key). If a row exists
//      and is fresh (< CACHE_TTL_DAYS old), render it immediately.
//   2. Otherwise, queue a `busdev_dd_v2_co_landscape` worker_jobs row and
//      poll it until Railway's dispatcher (NOT this page) runs the actual
//      GovCon pulls server-side and writes the cache row. See
//      workers/sam/dd_v2_co_landscape_handler.py for what that job does.
//   3. Re-read the cache once the job succeeds.
//
// The cache is keyed by (agency, naics_key), not by opportunity or PIID --
// deliberately. The office roster this shows doesn't change because two
// different opportunities happen to cite the same agency+NAICS space, so
// the first rep to open any brief in that space pays the GovCon cost once;
// every other brief reads the cache.
//
// KNOWN LIMITS (surfaced to the user in the Caveats card below, not hidden):
//   - No contact-name filter exists on the underlying GovCon search, so the
//     handler pulls the whole agency+NAICS set and groups it client-side.
//   - The Pro-plan search window caps at 730 days; older contracts won't
//     appear here even if still active.
//   - A notice with no NAICS classified in SAM (seen on Justification-type
//     notices in testing) will never surface via this NAICS-filtered pull.
//     The award that originally surfaced this CO may itself be missing here
//     for exactly that reason -- it is usually already shown elsewhere on
//     the brief, so this is a gap in completeness, not a lost data point.
//   - No deobligation / period-of-performance detail is pulled here. Award
//     Notice rows are flagged as follow-up candidates for a separate,
//     per-contract lookup -- this page does not make those calls itself.
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useOip } from '../lib/oip'

const CACHE_TTL_DAYS = 7
const POLL_INTERVAL_MS = 2500
const POLL_MAX_ATTEMPTS = 40 // ~100s ceiling before giving up on a stuck job

const money = (n) =>
  n == null ? '—' : `$${Math.round(Number(n)).toLocaleString()}`

// Mirrors _normalize_naics_key() in dd_v2_co_landscape_handler.py exactly --
// this MUST match the handler's normalization or the cache lookup key here
// will never match the row the job wrote.
function normalizeNaicsKey(naicsCsv) {
  const codes = (naicsCsv || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
  return Array.from(new Set(codes)).sort().join(',')
}

function isFresh(computedAt) {
  if (!computedAt) return false
  const ageMs = Date.now() - new Date(computedAt).getTime()
  return ageMs < CACHE_TTL_DAYS * 24 * 60 * 60 * 1000
}

function Card({ title, note, children }) {
  return (
    <div className="wq-col-card">
      <h3 className="wq-col-h">{title}</h3>
      {children}
      {note && <p className="wq-col-note">{note}</p>}
    </div>
  )
}

function ContractRow({ c }) {
  const hasAward = c.award_amount != null
  return (
    <tr>
      <td>
        <div className="blurable">{c.title || '—'}</div>
        <div className="wq-col-dim">
          {c.solicitation_number} · {c.notice_type}
          {Array.isArray(c.naics) && c.naics.length > 0 ? ` · NAICS ${c.naics.join(', ')}` : ''}
        </div>
      </td>
      <td className="blurable">{hasAward ? c.awardee_name : '—'}</td>
      <td className="wq-col-num">{hasAward ? money(c.award_amount) : '—'}</td>
      <td className="wq-col-num">
        {c.notice_type === 'Award Notice' && (
          <span className="wq-col-flag" title="Not pulled here — needs a separate /contracts/{piid} call">
            check term/deobligation
          </span>
        )}
      </td>
    </tr>
  )
}

function CoBlock({ name, email, phone, contracts, isKnown }) {
  const sorted = [...contracts].sort(
    (a, b) => (b.award_amount || 0) - (a.award_amount || 0)
  )
  return (
    <Card
      title={`${name}${isKnown ? '  (already known from this brief)' : ''}`}
      note={`${contracts.length} distinct procurement${contracts.length === 1 ? '' : 's'} in this space`}
    >
      {(email || phone) && (
        <p className="wq-col-contact blurable">
          {email && <span>{email}</span>}
          {email && phone && <span> · </span>}
          {phone && <span>{phone}</span>}
          {!phone && <span className="wq-col-dim"> (no phone on file)</span>}
        </p>
      )}
      <table className="wq-col-table">
        <thead>
          <tr>
            <th>Procurement</th>
            <th>Awardee</th>
            <th className="wq-col-num">Amount</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c, i) => (
            <ContractRow key={c.solicitation_number || i} c={c} />
          ))}
        </tbody>
      </table>
    </Card>
  )
}

export default function CoLandscapePage() {
  const [params, setParams] = useSearchParams()
  const [agencyInput, setAgencyInput] = useState(params.get('agency') || '')
  const agency = params.get('agency') || ''
  const knownCo = params.get('co') || null
  const [naicsInput, setNaicsInput] = useState(params.get('naics') || '')
  const naicsCsv = params.get('naics') || ''
  const naicsKey = normalizeNaicsKey(naicsCsv)

  const { selectedOip } = useOip()
  const [sentinelSuggestion, setSentinelSuggestion] = useState(null)

  useEffect(() => {
    if (!selectedOip?.tenant_id || !selectedOip?.vertical_id) return
    let cancelled = false
    ;(async () => {
      // Derived OIPs never carry their own sentinel (per project convention) --
      // find the sibling OIP under the same tenant+vertical that actually owns
      // one, rather than guessing off the "-derived" slug suffix.
      const { data: siblings } = await supabase
        .from('oips')
        .select('id')
        .eq('tenant_id', selectedOip.tenant_id)
        .eq('vertical_id', selectedOip.vertical_id)
      const siblingIds = (siblings || []).map((o) => o.id)
      if (siblingIds.length === 0) return
      const { data: sentinelRows } = await supabase
        .from('sentinels')
        .select('pull_config')
        .in('oip_id', siblingIds)
        .not('pull_config->naics_codes', 'is', null)
        .limit(1)
      if (cancelled) return
      const codes = sentinelRows?.[0]?.pull_config?.naics_codes
      if (Array.isArray(codes) && codes.length > 0) {
        setSentinelSuggestion(codes)
      }
    })()
    return () => { cancelled = true }
  }, [selectedOip?.tenant_id, selectedOip?.vertical_id])

  const [cacheRow, setCacheRow] = useState(null)
  const [phase, setPhase] = useState('loading') // loading | ready | queuing | polling | error | empty
  const [errMsg, setErrMsg] = useState(null)
  const pollRef = useRef(null)

  const [naicsErr, setNaicsErr] = useState(null)

  const applySearch = () => {
    const codes = naicsInput.split(',').map((c) => c.trim()).filter(Boolean)
    const bad = codes.filter((c) => !/^\d{6}$/.test(c))
    if (bad.length > 0) {
      setNaicsErr(
        `NAICS codes must be exactly 6 digits — "${bad.join('", "')}" ` +
        `isn't. GovCon's handling of shorter/prefix codes isn't confirmed, ` +
        `so a partial code is refused here rather than risk a silent, ` +
        `misleading zero-result search.`
      )
      return
    }
    if (!agencyInput.trim()) {
      setNaicsErr('Agency cannot be blank.')
      return
    }
    setNaicsErr(null)
    const next = new URLSearchParams(params)
    next.set('agency', agencyInput.trim())
    next.set('naics', codes.join(','))
    setParams(next, { replace: true })
  }

  const fetchCache = useCallback(async () => {
    if (!agency || !naicsKey) return null
    const { data, error } = await supabase
      .from('dd_co_landscape_cache')
      .select('agency, naics_key, computed_at, co_count, landscape')
      .eq('agency', agency)
      .eq('naics_key', naicsKey)
      .maybeSingle()
    if (error) throw error
    return data
  }, [agency, naicsKey])

  const queueJob = useCallback(async () => {
    if (!selectedOip?.id || !selectedOip?.vertical_id) {
      throw new Error('No OIP selected — cannot determine vertical for the job.')
    }
    const { data, error } = await supabase
      .from('worker_jobs')
      .insert({
        job_type: 'busdev_dd_v2_co_landscape',
        oip_id: selectedOip.id,
        vertical_id: selectedOip.vertical_id,
        status: 'queued',
        payload: { agency, naics_multiple: naicsCsv },
      })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  }, [agency, naicsCsv, selectedOip?.id, selectedOip?.vertical_id])

  const pollJob = useCallback(async (jobId) => {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      await new Promise((r) => { pollRef.current = setTimeout(r, POLL_INTERVAL_MS) })
      const { data, error } = await supabase
        .from('worker_jobs')
        .select('status, error_message')
        .eq('id', jobId)
        .single()
      if (error) throw error
      if (data.status === 'success') return
      if (data.status === 'failed' || data.status === 'failed_final' || data.status === 'skipped') {
        throw new Error(data.error_message || `Job ended with status "${data.status}"`)
      }
      // queued / running -> keep polling
    }
    throw new Error('Timed out waiting for the landscape job to finish. Try refreshing in a minute.')
  }, [])

  const load = useCallback(async (forceRefresh = false) => {
    setErrMsg(null)
    try {
      if (!forceRefresh) {
        setPhase('loading')
        const row = await fetchCache()
        if (row && isFresh(row.computed_at)) {
          setCacheRow(row)
          setPhase('ready')
          return
        }
      }
      setPhase('queuing')
      const jobId = await queueJob()
      setPhase('polling')
      await pollJob(jobId)
      const row = await fetchCache()
      if (!row) {
        setPhase('empty')
        return
      }
      setCacheRow(row)
      setPhase('ready')
    } catch (e) {
      setErrMsg(e.message || String(e))
      setPhase('error')
    }
  }, [fetchCache, queueJob, pollJob])

  useEffect(() => {
    load(false)
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agency, naicsKey])

  if (!agency || !naicsKey) {
    return (
      <div className="wq-col">
        <p className="wq-col-note">Missing agency or NAICS in the link that opened this page.</p>
        <Link to="/demand" className="wq-btn">Back to demand</Link>
      </div>
    )
  }

  const landscape = cacheRow?.landscape || {}
  const coNames = Object.keys(landscape)
  const orderedCoNames = [...coNames].sort((a, b) => {
    if (a === knownCo) return -1
    if (b === knownCo) return 1
    return (landscape[b]?.contracts?.length || 0) - (landscape[a]?.contracts?.length || 0)
  })

  return (
    <div className="wq-col">
      <div className="wq-col-head">
        <div>
          <h2 className="wq-col-title">CO landscape</h2>
          <div className="wq-col-meta">
            <span>Agency</span>
            <input
              className="wq-col-agency-input"
              value={agencyInput}
              onChange={(e) => setAgencyInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applySearch() }}
              placeholder="e.g. Secret Service"
            />
            <span>·</span>
            <span>NAICS</span>
            <input
              className="wq-col-naics-input"
              value={naicsInput}
              onChange={(e) => setNaicsInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applySearch() }}
              placeholder="e.g. 541810,541830"
            />
            <button className="wq-btn wq-btn-quiet" onClick={applySearch}>
              Search
            </button>
          </div>
        </div>
        {phase === 'ready' && (
          <button className="wq-btn wq-btn-quiet" onClick={() => load(true)}>
            Refresh
          </button>
        )}
      </div>
      {naicsErr && <p className="wq-col-note wq-col-warn">{naicsErr}</p>}
      {sentinelSuggestion && normalizeNaicsKey(sentinelSuggestion.join(',')) !== naicsKey && (
        <p className="wq-col-note wq-col-suggest">
          This account's sentinel is configured for NAICS{' '}
          <strong>{sentinelSuggestion.join(', ')}</strong> — broader than what's
          currently searched.{' '}
          <button
            className="wq-btn wq-btn-quiet"
            onClick={() => {
              setNaicsInput(sentinelSuggestion.join(','))
              const next = new URLSearchParams(params)
              next.set('naics', sentinelSuggestion.join(','))
              setParams(next, { replace: true })
            }}
          >
            Use sentinel scope
          </button>
        </p>
      )}

      {phase === 'loading' && <p className="wq-col-note">Checking for cached data…</p>}
      {phase === 'queuing' && <p className="wq-col-note">Queuing a data pull…</p>}
      {phase === 'polling' && (
        <p className="wq-col-note">
          Pulling procurement data — this runs server-side and usually
          takes a few seconds…
        </p>
      )}
      {phase === 'error' && (
        <p className="wq-col-note wq-col-warn">Could not load the CO landscape: {errMsg}</p>
      )}
      {phase === 'empty' && (
        <p className="wq-col-note">
          No contracting officers found for <strong>{agency}</strong> under NAICS{' '}
          <strong>{naicsCsv}</strong>. Two common causes: the NAICS scope is too
          narrow (related work can sit under an adjacent code — this account's own
          contracts have split across 541810 and 541830), or the agency name doesn't
          match how it's filed (try a shorter, plainer form like "Secret Service"
          rather than "U.S. Secret Service" — punctuation and abbreviations can
          cause an exact-substring miss). Adjust either field above and search again.
        </p>
      )}

      {phase === 'ready' && (
        <>
          <p className="wq-col-note">
            {cacheRow.co_count} contracting officer{cacheRow.co_count === 1 ? '' : 's'} found ·
            last pulled {new Date(cacheRow.computed_at).toLocaleString()}
          </p>

          {orderedCoNames.map((name) => (
            <CoBlock
              key={name}
              name={name}
              email={landscape[name]?.email}
              phone={landscape[name]?.phone}
              contracts={landscape[name]?.contracts || []}
              isKnown={name === knownCo}
            />
          ))}

          <Card title="Caveats">
            <ul className="wq-col-list">
              <li>
                Only covers notices within the current GovCon plan window (Pro: last ~730
                days) — older contracts, even if still active, won't appear here.
              </li>
              <li>
                A contract filed without a NAICS code in SAM (this happens on some
                Justification-type notices) can't surface here — the opportunity that
                brought you to this page may itself be missing below for that reason.
                It's usually already shown on the brief you came from.
              </li>
              <li>
                Deobligation and period-of-performance detail are not pulled here.
                Rows flagged "check term/deobligation" are Award Notices worth a
                separate, targeted follow-up before a call.
              </li>
            </ul>
          </Card>
        </>
      )}

      <style>{`
        .wq-col { padding: 1rem 0; }
        .wq-col-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
        .wq-col-title { font-size: 1.3rem; font-weight: 600; margin: 0 0 0.25rem; }
        .wq-col-meta { display: flex; gap: 0.5rem; font-size: 0.85rem; color: #6b7280; flex-wrap: wrap; align-items: center; }
        .wq-col-naics-input { font-family: inherit; font-size: 0.85rem; border: 1px solid #e5e7eb; border-radius: 6px; padding: 0.2rem 0.5rem; width: 9rem; }
        .wq-col-agency-input { font-family: inherit; font-size: 0.85rem; border: 1px solid #e5e7eb; border-radius: 6px; padding: 0.2rem 0.5rem; width: 11rem; }
        .wq-col-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 1rem 1.15rem; margin-bottom: 1rem; }
        .wq-col-h { font-size: 0.95rem; font-weight: 600; margin: 0 0 0.4rem; }
        .wq-col-contact { font-size: 0.82rem; color: #374151; margin: 0 0 0.6rem; }
        .wq-col-note { font-size: 0.82rem; color: #6b7280; margin: 0.4rem 0 0.8rem; }
        .wq-col-warn { color: #b91c1c; }
        .wq-col-suggest { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 0.6rem 0.8rem; color: #1e40af; }
        .wq-col-table { width: 100%; font-size: 0.85rem; border-collapse: collapse; margin-top: 0.4rem; }
        .wq-col-table th { text-align: left; font-size: 0.72rem; color: #9ca3af; font-weight: 500; padding: 0.2rem 0.4rem 0.4rem 0; border-bottom: 1px solid #f3f4f6; }
        .wq-col-table td { padding: 0.5rem 0.4rem 0.5rem 0; vertical-align: top; border-bottom: 1px solid #f9fafb; }
        .wq-col-num { text-align: right; white-space: nowrap; }
        .wq-col-dim { color: #9ca3af; font-size: 0.75rem; margin-top: 0.15rem; }
        .wq-col-flag { background: #fef3c7; color: #92400e; font-size: 0.68rem; padding: 0.15rem 0.4rem; border-radius: 4px; white-space: nowrap; }
        .wq-col-list { margin: 0.3rem 0 0; padding-left: 1.1rem; font-size: 0.82rem; color: #4b5563; }
        .wq-col-list li { margin-bottom: 0.4rem; }
        .wq-btn-quiet { background: transparent; border: 1px solid #e5e7eb; color: #374151; }
      `}</style>
    </div>
  )
}
