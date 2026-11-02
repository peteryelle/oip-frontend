// src/components/uploads/YourDocumentsPanel.jsx
//
// "Your documents" section of the opportunity brief, for SAM and SLED OIPs.
// Worker side: workers/sam/document_review_handler.py (+ sam_doc_analyze for
// SAM.gov notices). The browser never writes to `signals` or
// `opportunity_intel`; every change goes through a worker_jobs row.
//
//   Add documents  -> files to Storage bid-documents-raw at
//                     {tenant_id}/{oip_id}/{signal_id}/{ts}_{name}, then a FREE
//                     document_review job, mode="register"
//   Remove         -> FREE job, mode="remove" (worker deletes the file)
//   Rescore        -> METERED job, mode="rescore", max_attempts=1. Reads the
//                     full set (source + public attachments + uploads) and
//                     replaces the board score; the brief shows What changed.
//   Return to standard scoring -> FREE job, mode="restore"; offered only when
//                     no uploaded files remain on a rescored opportunity.
//
// Rule: the board score always reflects the current document set. Adding or
// removing files never changes the score by itself; the brief flags
// "Documents changed since analysis" until the user rescores.

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

const BUCKET = 'bid-documents-raw'
const POLL_MS = 5000
const FREE_TIMEOUT_MS = 3 * 60 * 1000      // Railway's poller runs every ~60s
const RESCORE_TIMEOUT_MS = 8 * 60 * 1000

function sanitizeFilename(name) {
  return (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
}

export function uploadsChangedSinceRead(uploads, docReview) {
  const now = (uploads || []).map(u => u.storage_path).filter(Boolean)
  const read = docReview?.analyzed_upload_paths || []
  return now.some(p => !read.includes(p)) || read.some(p => !now.includes(p))
}

const TIER_LABEL = { hot: 'Hot', warm: 'Warm', cold: 'Cold' }

export default function YourDocumentsPanel({
  os, sig, meta, selectedOip, closed = false, samNewDocsFn = null,
  loadFacts, onPatch,
}) {
  const [facts, setFacts] = useState({ loading: true, data: {} })
  const [busy, setBusy] = useState(null)   // 'add' | 'remove' | 'rescore' | 'restore'
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const pollRef = useRef(null)
  const fileRef = useRef(null)

  const scores = os.scores || {}
  const uploads = facts.data.uploaded_documents || []
  const dr = facts.data.doc_review || null
  const changes = dr?.changes || null
  const isPackage = meta.signal_type === 'document_upload'
  const pending = uploadsChangedSinceRead(uploads, dr) || (samNewDocsFn ? !!samNewDocsFn(dr) : false)
  const canRestore = !isPackage && uploads.length === 0 && !!scores.pre_document_score

  const refresh = async () => {
    try {
      const f = (await loadFacts()) || {}
      setFacts({ loading: false, data: f })
      return f
    } catch {
      setFacts({ loading: false, data: {} })
      return {}
    }
  }

  useEffect(() => {
    setFacts({ loading: true, data: {} }); setBusy(null); setNote(''); setError('')
    refresh()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [os.signal_id, os.oip_id])

  const queue = async (payload, maxAttempts) => {
    const row = {
      job_type: 'document_review', oip_id: os.oip_id, vertical_id: selectedOip.vertical_id,
      status: 'queued',
      payload: { ...payload, signal_id: os.signal_id, oip_slug: selectedOip.slug, triggered_by: 'drawer' },
    }
    if (maxAttempts) row.max_attempts = maxAttempts
    const { error: e } = await supabase.from('worker_jobs').insert(row)
    if (e) throw new Error(e.message)
  }

  // Poll until `done(facts)` is true, then run `after`.
  const pollUntil = (done, timeoutMs, timeoutMsg, after) => {
    const started = Date.now()
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const f = await refresh()
      if (done(f)) {
        clearInterval(pollRef.current); setBusy(null); setNote('')
        after && after(f)
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(pollRef.current); setBusy(null); setNote(timeoutMsg)
      }
    }, POLL_MS)
  }

  const refreshRow = async () => {
    const { data } = await supabase.from('oip_signals')
      .select('signal_tier, signal_value, match_reason, scores')
      .eq('oip_id', os.oip_id).eq('signal_id', os.signal_id).maybeSingle()
    if (data && onPatch) onPatch(data)
  }

  const addFiles = async (e) => {
    const picked = Array.from(e.target.files || [])
    e.target.value = ''
    const allowed = picked.filter(f => /\.(pdf|docx)$/i.test(f.name))
    setError(allowed.length !== picked.length ? 'Only PDF and DOCX files are supported; some files were skipped.' : '')
    if (!allowed.length) return
    setBusy('add')
    try {
      const docs = []
      for (let i = 0; i < allowed.length; i++) {
        const f = allowed[i]
        setNote(`Uploading ${i + 1} of ${allowed.length}: ${f.name}`)
        const path = `${selectedOip.tenant_id}/${os.oip_id}/${os.signal_id}/${Date.now()}_${sanitizeFilename(f.name)}`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: false })
        if (upErr) throw new Error(`Upload failed for ${f.name}: ${upErr.message}`)
        docs.push({ filename: f.name, storage_path: path })
      }
      await queue({ mode: 'register', documents: docs })
      setNote('Adding to this opportunity. This takes about a minute.')
      const want = docs.map(d => d.storage_path)
      pollUntil(
        f => want.every(p => (f.uploaded_documents || []).some(u => u.storage_path === p)),
        FREE_TIMEOUT_MS, 'Still adding. Reopen this opportunity in a minute.',
      )
    } catch (err) {
      setBusy(null); setNote(''); setError(err.message || String(err))
    }
  }

  const removeFile = async (u) => {
    if (!confirm(`Remove ${u.filename}? The score won't change until you rescore.`)) return
    setBusy('remove'); setError('')
    try {
      await queue({ mode: 'remove', storage_paths: [u.storage_path] })
      setNote('Removing. This takes about a minute.')
      pollUntil(
        f => !(f.uploaded_documents || []).some(x => x.storage_path === u.storage_path),
        FREE_TIMEOUT_MS, 'Still removing. Reopen this opportunity in a minute.',
      )
    } catch (err) {
      setBusy(null); setNote(''); setError(err.message || String(err))
    }
  }

  const rescore = async () => {
    let allowClosed = false
    if (closed) {
      if (!confirm('This notice is no longer open for bids. Rescore it anyway? Useful before pitching the awardee as a subcontractor.')) return
      allowClosed = true
    } else if (!confirm('Rescore this opportunity on the full document set? This runs a paid analysis and replaces the current score.')) {
      return
    }
    setBusy('rescore'); setError('')
    const before = `${dr?.analyzed_at || ''}|${dr?.status_rechecked_at || ''}`
    try {
      await queue({ mode: 'rescore', ...(allowClosed ? { allow_closed: true } : {}) }, 1)
      setNote('Reading the documents. This usually takes one to three minutes.')
      pollUntil(
        f => {
          const d = f.doc_review || {}
          return `${d.analyzed_at || ''}|${d.status_rechecked_at || ''}` !== before
        },
        RESCORE_TIMEOUT_MS, 'Still working. Reopen this opportunity in a few minutes to see the result.',
        async (f) => {
          if (f.doc_review?.skipped === 'closed') {
            setNote('Not rescored: the notice is closed. Rescore again and confirm to read it anyway.')
          }
          await refreshRow()
        },
      )
    } catch (err) {
      setBusy(null); setNote(''); setError(`Could not start the rescore: ${err.message || err}`)
    }
  }

  const restore = async () => {
    if (!confirm('Return to standard scoring? The original score comes back and the weekly run scores this opportunity again.')) return
    setBusy('restore'); setError('')
    try {
      await queue({ mode: 'restore' })
      setNote('Restoring. This takes about a minute.')
      const started = Date.now()
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        const { data } = await supabase.from('oip_signals')
          .select('signal_tier, signal_value, match_reason, scores')
          .eq('oip_id', os.oip_id).eq('signal_id', os.signal_id).maybeSingle()
        if (data && !data.scores?.pre_document_score) {
          clearInterval(pollRef.current); setBusy(null); setNote('Back to standard scoring.')
          onPatch && onPatch(data); refresh()
        } else if (Date.now() - started > FREE_TIMEOUT_MS) {
          clearInterval(pollRef.current); setBusy(null); setNote('Still restoring. Reopen this opportunity in a minute.')
        }
      }, POLL_MS)
    } catch (err) {
      setBusy(null); setNote(''); setError(err.message || String(err))
    }
  }

  // ── styles ────────────────────────────────────────────────────────────────
  const h = { fontSize: 13, fontWeight: 700, color: 'var(--ink)', margin: '0 0 8px' }
  const muted = { fontSize: 13, color: 'var(--ink-fade)' }
  const btn = (primary) => ({
    fontSize: 13, fontWeight: 600, padding: '6px 12px', borderRadius: 4,
    cursor: busy ? 'default' : 'pointer',
    border: primary ? '1px solid var(--primary)' : '1px solid var(--rule)',
    background: primary ? 'var(--primary)' : 'transparent', color: primary ? '#fff' : 'var(--ink)',
    opacity: busy ? 0.6 : 1,
  })
  const pill = (text, tone) => {
    const t = tone === 'warn'
      ? { color: '#8a4b00', bg: '#fff4e0', border: '#ffcc80' }
      : { color: '#174a7c', bg: '#e8f0fb', border: '#b3cdee' }
    return (
      <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, lineHeight: 1.4,
        color: t.color, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 3,
        padding: '1px 6px', whiteSpace: 'nowrap' }}>{text}</span>
    )
  }
  const arrow = (a, b, fmt = x => x ?? '—') => (
    a === b || a == null ? <strong>{fmt(b)}</strong>
      : <span><span style={{ color: 'var(--ink-fade)' }}>{fmt(a)}</span> → <strong>{fmt(b)}</strong></span>
  )

  return (
    <div data-pdf-exclude-controls style={{ marginBottom: 20, paddingTop: 14, borderTop: '1px solid var(--rule)' }}>
      <div style={h}>Your documents</div>

      {facts.loading ? (
        <div style={muted}>Loading…</div>
      ) : (
        <>
          {uploads.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 10px' }}>
              {uploads.map(u => (
                <li key={u.storage_path} style={{ padding: '4px 0', fontSize: 13, display: 'flex',
                  gap: 10, alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ wordBreak: 'break-word', color: 'var(--ink)' }}>{u.filename}</span>
                  <button onClick={() => removeFile(u)} disabled={!!busy}
                    style={{ background: 'none', border: 'none', padding: 0, fontSize: 12,
                      color: 'var(--ink-fade)', textDecoration: 'underline',
                      cursor: busy ? 'default' : 'pointer' }}>Remove</button>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ ...muted, marginBottom: 10 }}>
              {isPackage
                ? 'Add amendments, Q&A or other files to this package.'
                : 'Add files you have for this opportunity (Q&A, amendments, drawings lists, emails saved as PDF). They are read together with the original documents when you rescore.'}
            </div>
          )}

          {pending && (
            <div style={{ marginBottom: 10 }}>{pill('Documents changed since analysis', 'warn')}</div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <input ref={fileRef} type="file" accept=".pdf,.docx" multiple onChange={addFiles} style={{ display: 'none' }} />
            <button style={btn(false)} disabled={!!busy} onClick={() => fileRef.current?.click()}>Add documents</button>
            {canRestore ? (
              <button style={btn(false)} disabled={!!busy} onClick={restore}>Return to standard scoring</button>
            ) : (
              <button style={btn(pending)} disabled={!!busy} onClick={rescore}>Rescore</button>
            )}
          </div>
          {!canRestore && (
            <div style={{ fontSize: 12, color: 'var(--ink-fade)', marginBottom: 6 }}>
              Rescore reads everything for this opportunity and replaces its score. It's a paid analysis.
            </div>
          )}
          {error && (
            <div style={{ padding: '8px 12px', margin: '8px 0', borderRadius: 4,
              background: '#fee2e2', color: '#8b1a1a', fontSize: 13 }}>{error}</div>
          )}
          {note && <div style={{ fontSize: 12, color: 'var(--ink-fade)', marginTop: 6 }}>{note}</div>}

          {/* Latest document read */}
          {dr && dr.relevance_score != null && (
            <div style={{ marginTop: 16 }}>
              <div style={h}>Document read</div>
              <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{ fontSize: 13 }}>Score <strong>{dr.relevance_score}</strong></span>
                {dr.recommendation && <span style={{ fontSize: 13, fontWeight: 700 }}>{dr.recommendation}</span>}
                {dr.analyzed_at && <span style={muted}>{new Date(dr.analyzed_at).toLocaleDateString()}</span>}
              </div>
              {dr.reason && <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink)', margin: '0 0 10px' }}>{dr.reason}</p>}
              {(dr.flags || []).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  {dr.flags.map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      {pill(f.label, f.severity === 'block' || f.severity === 'warn' ? 'warn' : 'info')}
                      <span style={{ fontSize: 12, color: 'var(--ink-fade)', lineHeight: 1.45 }}>{f.detail}</span>
                    </div>
                  ))}
                </div>
              )}

              {changes && (
                <div style={{ margin: '12px 0', padding: '10px 12px', border: '1px solid var(--rule)', borderRadius: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>What changed</div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, marginBottom: 8 }}>
                    <span>Score {arrow(changes.before?.score, changes.after?.score)}</span>
                    <span>Tier {arrow(changes.before?.tier, changes.after?.tier, x => TIER_LABEL[x] || x || '—')}</span>
                    <span>{arrow(changes.before?.recommendation || null, changes.after?.recommendation)}</span>
                  </div>
                  {(changes.new_files?.length > 0 || changes.removed_files?.length > 0) && (
                    <div style={{ fontSize: 12, color: 'var(--ink-fade)', marginBottom: 6 }}>
                      {changes.new_files?.length > 0 && <div>Added: {changes.new_files.join(', ')}</div>}
                      {changes.removed_files?.length > 0 && <div>Removed: {changes.removed_files.join(', ')}</div>}
                    </div>
                  )}
                  {changes.summary && <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink)', margin: '0 0 6px' }}>{changes.summary}</p>}
                  {(changes.bullets || []).length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {changes.bullets.map((b, i) => (
                        <li key={i} style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink-light)' }}>{b}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {['opportunity', 'concerns', 'gaps'].map(k => {
                const sec = dr.analysis?.[k]
                if (!sec?.summary) return null
                const title = { opportunity: 'Why it fits', concerns: 'Concerns', gaps: 'Verify before bidding' }[k]
                return (
                  <div key={k} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink-light)' }}>{sec.summary}</div>
                  </div>
                )
              })}
              <details style={{ fontSize: 12, color: 'var(--ink-fade)', margin: '6px 0 0' }}>
                <summary style={{ cursor: 'pointer' }}>
                  Read {dr.files_analyzed?.length || 0} file{(dr.files_analyzed?.length || 0) === 1 ? '' : 's'}
                  {dr.files_skipped?.length ? `, skipped ${dr.files_skipped.length}` : ''}
                </summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {(dr.files_analyzed || []).map(f => <li key={f.filename}>{f.filename}</li>)}
                  {(dr.files_skipped || []).map(f => <li key={f.filename} style={{ opacity: 0.7 }}>{f.filename}: skipped, {f.why}</li>)}
                </ul>
              </details>
            </div>
          )}
        </>
      )}
    </div>
  )
}
