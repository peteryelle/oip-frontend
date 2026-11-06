// src/pages/PrimeAccountPage.jsx
//
// Account view for a single federal prime. Route: /prime/:uei
// (/account is already the user's own settings page.)
//
// Everything here comes from one RPC — dd_account_brief(tenant_id, uei) — which
// is deterministic SQL over dd_prime_facts / dd_prime_awards. No LLM, no job,
// no stored narrative, so it is always current and costs nothing to render.
//
// PRESENTATION ONLY. The function draws no conclusions and neither does this
// page: it shows prime_revenue_share alongside sub_revenue_total AND who they
// subbed for, and lets the reader decide whether the account is reachable. An
// earlier draft badged accounts "hard to enter" off a high self-perform rate —
// but whether a prime's one subaward is relevant work is the tenant's call.
//
// Three windows are labelled rather than reconciled, because they measure
// different periods and blending them produced a 6x discrepancy:
//   addressable   contracts live since FY2025 start — the sellable surface
//   momentum      awarded FY2025 to date — new business won
//   fpds_window   GovCon's own federal obligation total for its window
//
// "How they buy" card (Nov 2026): a second RPC, dd_prime_tech_evidence, returns
// the public technology evidence the DD v2 brief handler gathered for THIS
// tenant — reverse lookup on the tenant's competitors' sites plus a footprint
// search — and the prime-level gap read. Shown as found, with its source link;
// absence of evidence is stated as absence, never as "they don't buy it".
import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useOip } from '../lib/oip'

const money = (n) =>
  n == null ? '—' : `$${Math.round(Number(n)).toLocaleString()}`

const moneyShort = (n) => {
  if (n == null) return '—'
  const v = Number(n)
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (Math.abs(v) >= 1e3) return `$${Math.round(v / 1e3)}K`
  return `$${Math.round(v)}`
}

const monthLabel = (ym) => {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

function Metric({ label, value, sub }) {
  return (
    <div className="wq-acct-metric">
      <div className="wq-acct-metric-lbl">{label}</div>
      <div className="wq-acct-metric-val">{value}</div>
      {sub && <div className="wq-acct-metric-sub">{sub}</div>}
    </div>
  )
}

function Card({ title, children, note }) {
  if (!children) return null
  return (
    <div className="wq-acct-card">
      <h3 className="wq-acct-h">{title}</h3>
      {children}
      {note && <p className="wq-acct-note">{note}</p>}
    </div>
  )
}

const EVIDENCE_HEADLINE = {
  competitor_in_use: (v) => `Uses ${v || 'a competitor'}`,
  other_vendor_in_use: (v) => `Buys from ${v || 'another vendor'}`,
  relationship_only: (v) => `Known relationship with ${v || 'a competitor'}`,
  own_platform: () => 'Builds its own',
  none_found: () => 'No public evidence found',
}

const RELATIONSHIP_LABEL = {
  campaign_case_study: 'campaign case study',
  partner_listing: 'partner listing',
  job_posting: 'job posting',
  interview_or_comarketing: 'interview / co-marketing — not proof of purchase',
}

const CORE_LABEL = {
  core: 'Core business',
  adjacent: 'Adjacent — works in the field, nothing names this capability',
  outside: 'Outside — different work',
  unknown: 'Unknown — not enough evidence',
}

function TechEvidenceCard({ data }) {
  const ev = data?.evidence
  if (!ev) return null
  const verdict = ev.tech_evidence || 'none_found'
  const headline = (EVIDENCE_HEADLINE[verdict] || EVIDENCE_HEADLINE.none_found)(ev.vendor_named)
  const rel = RELATIONSHIP_LABEL[ev.relationship_type]
  const gap = data.prime_gap || null
  const terms = (data.capability_terms || []).slice(0, 3).join(', ')
  const supporting = (ev.supporting || []).filter(s => s?.url)
  const checked = ev.fetched_at ? new Date(ev.fetched_at).toLocaleDateString() : null
  const tone = verdict === 'competitor_in_use' || verdict === 'other_vendor_in_use'
    ? 'wq-acct-ev-strong'
    : verdict === 'relationship_only' ? 'wq-acct-ev-mid'
    : verdict === 'own_platform' ? 'wq-acct-ev-closed' : 'wq-acct-ev-none'

  return (
    <Card
      title={terms ? `How they buy ${terms}` : 'How they buy this capability'}
      note={`Public evidence from competitor sites and the prime's own footprint${checked ? `, checked ${checked}` : ''}. Re-checked monthly. No evidence does not mean they don't buy it.`}
    >
      <div className={`wq-acct-ev ${tone}`}>
        <span className="wq-acct-ev-head blurable">{headline}</span>
        {rel && <span className="wq-acct-dim"> · {rel}</span>}
      </div>
      {ev.evidence_line && (
        <p className="wq-acct-ev-line blurable">
          {ev.evidence_line}
          {ev.evidence_url && (
            <> {' '}<a href={ev.evidence_url} target="_blank" rel="noreferrer">source</a></>
          )}
        </p>
      )}
      {gap?.prime_core && (
        <table className="wq-acct-table" style={{ marginTop: '0.5rem' }}>
          <tbody>
            <tr>
              <td>Their own core</td>
              <td className="wq-acct-num">{CORE_LABEL[gap.prime_core] || gap.prime_core}</td>
            </tr>
            {gap.prime_core_evidence && (
              <tr>
                <td colSpan={2} className="wq-acct-dim blurable">{gap.prime_core_evidence}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {supporting.length > 0 && (
        <>
          <p className="wq-acct-note" style={{ marginTop: '0.6rem' }}>Mentions on competitor sites:</p>
          <ul className="wq-acct-list">
            {supporting.map((s, i) => (
              <li key={i}>
                <a href={s.url} target="_blank" rel="noreferrer" className="blurable">
                  {s.title || s.url.replace(/^https?:\/\//, '')}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {ev.competitors?.length > 0 && (
        <p className="wq-acct-note">Checked against: {ev.competitors.join(', ')} — edit in Profile.</p>
      )}
    </Card>
  )
}

export default function PrimeAccountPage() {
  const { uei } = useParams()
  const { selectedOip } = useOip()
  const [brief, setBrief] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [techEv, setTechEv] = useState(null)

  useEffect(() => {
    if (!selectedOip?.tenant_id || !uei) return
    let cancelled = false
    setLoading(true)
    setErr(null)
    setTechEv(null)
    ;(async () => {
      const { data, error } = await supabase.rpc('dd_account_brief', {
        p_tenant_id: selectedOip.tenant_id,
        p_uei: uei,
      })
      if (cancelled) return
      if (error) setErr(error.message)
      // supabase-js returns a scalar jsonb directly, but wraps set-returning
      // functions in an array. Handle both so the shape is not a deploy risk.
      else setBrief(Array.isArray(data) ? (data[0] ?? null) : data)
      setLoading(false)

      // Evidence is optional — a missing function or empty result must never
      // break the account view, so errors are swallowed here.
      const ev = await supabase.rpc('dd_prime_tech_evidence', {
        p_tenant_id: selectedOip.tenant_id,
        p_uei: uei,
      })
      if (cancelled) return
      if (!ev.error) setTechEv(Array.isArray(ev.data) ? (ev.data[0] ?? null) : ev.data)
    })()
    return () => { cancelled = true }
  }, [selectedOip?.tenant_id, uei])

  if (loading) return <div className="wq-acct"><p className="wq-acct-note">Loading account…</p></div>
  if (err) return <div className="wq-acct"><p className="wq-acct-note">Could not load account: {err}</p></div>
  if (!brief || !brief.identity) {
    return (
      <div className="wq-acct">
        <p className="wq-acct-note">
          No collected data for {uei}. This prime has not been through a collection run.
        </p>
        <Link to="/demand" className="wq-btn">Back to demand</Link>
      </div>
    )
  }

  const id = brief.identity || {}
  const addr = brief.addressable || {}
  const mom = brief.momentum || {}
  const fpds = brief.fpds_window || {}
  const cal = brief.recompete_calendar || []
  const agencies = brief.agency_concentration || []
  const self = brief.self_perform || {}
  const vehicles = brief.vehicles || {}
  const perf = brief.performance || {}
  const contact = brief.contacts?.contact || null
  const caveats = brief.caveats || []
  const byCode = addr.by_code || []
  const liveVehicles = vehicles.live_addressable || []
  const subbedFor = self.subbed_for || []

  const calMax = cal.reduce((m, r) => Math.max(m, Number(r.value) || 0), 0)
  const cal18 = cal.reduce((s, r) => s + (Number(r.value) || 0), 0)
  const cal18n = cal.reduce((s, r) => s + (Number(r.awards) || 0), 0)

  return (
    <div className="wq-acct">
      <div className="wq-acct-head">
        <div>
          <h2 className="wq-acct-name blurable">{id.name}</h2>
          <div className="wq-acct-meta">
            <span className="blurable">{uei}</span>
            {id.location?.city && (
              <span className="blurable">{id.location.city}, {id.location.state}</span>
            )}
            {id.url && (
              <a href={id.url} target="_blank" rel="noreferrer" className="blurable">
                {id.url.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="wq-acct-metrics">
        <Metric
          label="Addressable book"
          value={moneyShort(addr.value)}
          sub={`${addr.awards ?? 0} awards live since Oct 2024`}
        />
        <Metric
          label="Share of live federal work"
          value={addr.pct_of_federal_live != null ? `${addr.pct_of_federal_live}%` : '—'}
          sub="in your target NAICS"
        />
        <Metric
          label="Won FY2025 to date"
          value={moneyShort(mom.value)}
          sub={`${mom.awards ?? 0} awards`}
        />
        <Metric
          label="Expiring in 18 months"
          value={cal18n}
          sub={`${moneyShort(cal18)} combined`}
        />
      </div>

      <TechEvidenceCard data={techEv} />

      {byCode.length > 0 && (
        <Card title="Addressable book by code">
          <table className="wq-acct-table">
            <tbody>
              {byCode.map((c, i) => (
                <tr key={i}>
                  <td>
                    {c.description || c.code}
                    <span className="wq-acct-dim"> {c.code}</span>
                  </td>
                  <td className="wq-acct-num">{c.awards}</td>
                  <td className="wq-acct-num">{money(c.value)}</td>
                  <td className="wq-acct-num">{c.pct != null ? `${c.pct}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {cal.length > 0 && (
        <Card
          title="Recompete calendar"
          note="Addressable contracts only — work this tenant could bid."
        >
          {cal.map((r, i) => (
            <div className="wq-acct-bar-row" key={i}>
              <span className="wq-acct-bar-lbl">{monthLabel(r.month)}</span>
              <div className="wq-acct-bar-track">
                <div
                  className="wq-acct-bar"
                  style={{ width: `${calMax ? (Number(r.value) / calMax) * 100 : 0}%` }}
                />
              </div>
              <span className="wq-acct-bar-val">
                {r.awards} · {moneyShort(r.value)}
              </span>
            </div>
          ))}
        </Card>
      )}

      {agencies.length > 0 && (
        <Card
          title="Where the money came from"
          note="Top 5 sub-agencies by obligation in the FPDS window. Percentages are share of listed."
        >
          <table className="wq-acct-table">
            <tbody>
              {agencies.map((a, i) => (
                <tr key={i}>
                  <td className="blurable">
                    {a.name}
                    {a.in_icp && <span className="wq-acct-flag">in your ICP</span>}
                  </td>
                  <td className="wq-acct-num">{money(a.value)}</td>
                  <td className="wq-acct-num">{a.pct != null ? `${a.pct}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {liveVehicles.length > 0 && (
        <Card
          title="Live vehicles in your codes"
          note={`${vehicles.count_all ?? 0} vehicles held in total. Ceiling shown is the vehicle's total across all holders, not this prime's share.`}
        >
          <table className="wq-acct-table">
            <tbody>
              {liveVehicles.map((v, i) => (
                <tr key={i}>
                  <td className="blurable">
                    {v.agency}
                    <span className="wq-acct-dim"> {v.type} · {v.piid}</span>
                  </td>
                  <td className="wq-acct-num">
                    {v.ordering_period_end
                      ? `to ${new Date(v.ordering_period_end).toLocaleDateString()}`
                      : '—'}
                  </td>
                  <td className="wq-acct-num">
                    {v.vehicle_ceiling_all_holders
                      ? moneyShort(v.vehicle_ceiling_all_holders)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="wq-acct-two">
        <Card title="Prime vs sub">
          <table className="wq-acct-table">
            <tbody>
              <tr>
                <td>Prime revenue share</td>
                <td className="wq-acct-num">
                  {self.prime_revenue_share_pct != null ? `${self.prime_revenue_share_pct}%` : '—'}
                </td>
              </tr>
              <tr>
                <td>Sub revenue</td>
                <td className="wq-acct-num">{money(self.sub_revenue_total)}</td>
              </tr>
            </tbody>
          </table>
          {subbedFor.length > 0 && (
            <>
              <p className="wq-acct-note" style={{ marginTop: '0.6rem' }}>Subcontracted for:</p>
              <ul className="wq-acct-list">
                {subbedFor.map((p, i) => (
                  <li key={i} className="blurable">
                    {p.name} — {money(p.total)}
                    {p.subaward_count ? ` · ${p.subaward_count} subaward${p.subaward_count > 1 ? 's' : ''}` : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card
          title="Performance"
          note={
            perf.scored_awards != null
              ? `Based on ${perf.scored_awards} of ${perf.book_awards} awards — highest-value transaction ledgers only.`
              : null
          }
        >
          <table className="wq-acct-table">
            <tbody>
              <tr>
                <td>Deobligations</td>
                <td className="wq-acct-num">
                  {perf.deobligation_total ? money(perf.deobligation_total) : 'none'}
                  {perf.awards_with_deobligation
                    ? ` · ${perf.awards_with_deobligation} award${perf.awards_with_deobligation > 1 ? 's' : ''}`
                    : ''}
                </td>
              </tr>
              <tr>
                <td>Terminations</td>
                <td className="wq-acct-num">{perf.terminations ?? 0}</td>
              </tr>
              <tr>
                <td>Options exercised</td>
                <td className="wq-acct-num">{perf.options_exercised ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>

      {contact && (
        <Card title="Point of contact">
          <p className="blurable">
            <strong>{contact.name}</strong>
            {contact.title ? ` — ${contact.title}` : ''}
          </p>
          {(contact.city || contact.state) && (
            <p className="wq-acct-note blurable">
              {[contact.city, contact.state].filter(Boolean).join(', ')}
            </p>
          )}
          <p className="wq-acct-note">Source: SAM entity registration</p>
        </Card>
      )}

      <Card title="Federal activity">
        <table className="wq-acct-table">
          <tbody>
            <tr>
              <td>FPDS obligated</td>
              <td className="wq-acct-num">
                {money(fpds.obligated)}
                {fpds.net_deobligating && (
                  <span className="wq-acct-warn"> net deobligating</span>
                )}
              </td>
            </tr>
            <tr>
              <td>Window</td>
              <td className="wq-acct-num">{fpds.window || '—'}</td>
            </tr>
            <tr>
              <td>Distinct contracts</td>
              <td className="wq-acct-num">{fpds.contracts ?? '—'}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      {caveats.length > 0 && (
        <Card title="Caveats">
          <ul className="wq-acct-list">
            {caveats.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </Card>
      )}

      <style>{`
        .wq-acct { padding: 1rem 0; }
        .wq-acct-head { display: flex; justify-content: space-between; margin-bottom: 1.25rem; }
        .wq-acct-name { font-size: 1.4rem; font-weight: 600; margin: 0 0 0.25rem; }
        .wq-acct-meta { display: flex; gap: 0.75rem; font-size: 0.85rem; color: #6b7280; flex-wrap: wrap; }
        .wq-acct-meta a { color: #2563eb; text-decoration: none; }
        .wq-acct-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; margin-bottom: 1.25rem; }
        .wq-acct-metric { background: #f9fafb; border-radius: 8px; padding: 0.9rem 1rem; }
        .wq-acct-metric-lbl { font-size: 0.75rem; color: #6b7280; margin-bottom: 0.25rem; }
        .wq-acct-metric-val { font-size: 1.4rem; font-weight: 600; }
        .wq-acct-metric-sub { font-size: 0.75rem; color: #6b7280; margin-top: 0.2rem; }
        .wq-acct-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 1rem 1.15rem; margin-bottom: 1rem; }
        .wq-acct-h { font-size: 0.95rem; font-weight: 600; margin: 0 0 0.7rem; }
        .wq-acct-note { font-size: 0.78rem; color: #6b7280; margin: 0.6rem 0 0; }
        .wq-acct-table { width: 100%; font-size: 0.85rem; border-collapse: collapse; }
        .wq-acct-table td { padding: 0.3rem 0; vertical-align: top; }
        .wq-acct-num { text-align: right; white-space: nowrap; }
        .wq-acct-dim { color: #9ca3af; font-size: 0.78rem; }
        .wq-acct-flag { background: #eef2ff; color: #4338ca; font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 4px; margin-left: 0.4rem; }
        .wq-acct-warn { color: #b91c1c; font-size: 0.78rem; }
        .wq-acct-list { margin: 0.3rem 0 0; padding-left: 1.1rem; font-size: 0.82rem; color: #4b5563; }
        .wq-acct-list li { margin-bottom: 0.25rem; }
        .wq-acct-two { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
        .wq-acct-bar-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.25rem 0; }
        .wq-acct-bar-lbl { font-size: 0.8rem; color: #6b7280; width: 5.5rem; flex-shrink: 0; }
        .wq-acct-bar-track { flex: 1; height: 18px; background: #f3f4f6; border-radius: 3px; }
        .wq-acct-bar { height: 18px; background: #93c5fd; border-radius: 3px; }
        .wq-acct-bar-val { font-size: 0.8rem; white-space: nowrap; width: 6.5rem; text-align: right; }
        .wq-acct-ev { font-size: 0.95rem; padding: 0.45rem 0.7rem; border-radius: 6px; border-left: 3px solid; }
        .wq-acct-ev-head { font-weight: 600; }
        .wq-acct-ev-strong { background: #ecfdf5; border-color: #059669; }
        .wq-acct-ev-mid { background: #fffbeb; border-color: #d97706; }
        .wq-acct-ev-closed { background: #f3f4f6; border-color: #6b7280; }
        .wq-acct-ev-none { background: #f9fafb; border-color: #d1d5db; color: #4b5563; }
        .wq-acct-ev-line { font-size: 0.85rem; color: #374151; margin: 0.55rem 0 0; }
        .wq-acct-ev-line a { color: #2563eb; text-decoration: none; }
        .wq-acct-list a { color: #2563eb; text-decoration: none; }
      `}</style>
    </div>
  )
}
