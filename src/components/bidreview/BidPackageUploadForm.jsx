// src/components/bidreview/BidPackageUploadForm.jsx
//
// "Upload opportunity": the customer adds a solicitation they received outside
// WinQuest (title + agency + documents). Used on SAM and SLED Market Review
// boards (and the legacy Bid/No-Bid board).
//
// The browser does NOT write to `signals` (shared pool; no browser insert
// policy, by design). On submit:
//   1. Pick a new signal id in the browser.
//   2. Upload each file to Storage bucket `bid-documents-raw` at
//      {tenant_id}/{oip_id}/{signal_id}/{filename} (the path the storage RLS
//      policy and the worker both expect).
//   3. Queue one `document_review` job, mode="new", with {signal_id, title,
//      agency, documents}. max_attempts=1: it is a paid analysis, so a
//      failure is never silently retried.
// The worker creates the signal (tagged document_upload + owner_oip_id),
// reads the package and writes the oip_signals row. MarketReviewPage's
// Realtime subscription shows the card when it lands (~1-3 min).
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const BUCKET = 'bid-documents-raw'

// Storage object keys reject some characters — conservative allowlist rather
// than trying to enumerate what's disallowed.
function sanitizeFilename(name) {
  return (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
}

export default function BidPackageUploadForm({ oipId, tenantId, oipSlug, verticalId, family = 'federal', onUploaded, onClose }) {
  const [title, setTitle] = useState('')
  const [agency, setAgency] = useState('')
  const [files, setFiles] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [error, setError] = useState('')

  const canSubmit = title.trim() && files.length > 0 && !submitting

  const handleFileChange = (e) => {
    const picked = Array.from(e.target.files || [])
    const allowed = picked.filter(f => /\.(pdf|docx)$/i.test(f.name))
    if (allowed.length !== picked.length) {
      setError('Only PDF and DOCX files are supported — some files were skipped.')
    } else {
      setError('')
    }
    setFiles(allowed)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError('')

    try {
      // 1. New id, chosen here; the worker creates the signal with it.
      const signalId = crypto.randomUUID()

      // 2. Upload each file to Storage
      const uploadedDocs = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setStatusMsg(`Uploading ${i + 1} of ${files.length}: ${file.name}`)
        const filename = sanitizeFilename(file.name)
        const path = `${tenantId}/${oipId}/${signalId}/${filename}`
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { upsert: false })
        if (upErr) throw new Error(`Upload failed for ${file.name}: ${upErr.message}`)
        uploadedDocs.push({ filename: file.name, storage_path: path })
      }

      // 3. Queue the analysis (worker creates the signal, then reads it)
      setStatusMsg('Starting the analysis…')
      const { error: jobErr } = await supabase
        .from('worker_jobs')
        .insert({
          job_type: 'document_review',
          oip_id: oipId,
          vertical_id: verticalId,
          status: 'queued',
          max_attempts: 1,
          payload: {
            mode: 'new',
            signal_id: signalId,
            title: title.trim(),
            agency: agency.trim(),
            documents: uploadedDocs,
            oip_slug: oipSlug,
            triggered_by: 'upload_form',
          },
        })
      if (jobErr) throw new Error(`Could not start the analysis: ${jobErr.message}`)

      setStatusMsg('')
      onUploaded && onUploaded(signalId)
      onClose && onClose()
    } catch (err) {
      setError(err.message || String(err))
      setStatusMsg('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--paper)', borderRadius: 6, padding: '28px 32px',
          width: 480, maxWidth: '90vw', border: '1px solid var(--rule)',
        }}
      >
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-fade)',
          marginBottom: 4,
        }}>
          Upload opportunity
        </div>
        <div style={{
          fontFamily: "'Spectral', Georgia, serif", fontSize: 22, fontWeight: 600,
          color: 'var(--ink)', marginBottom: 20,
        }}>
          Add a solicitation to this board
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-fade)', lineHeight: 1.5, margin: '-12px 0 18px' }}>
          For bids you received outside WinQuest. We read the documents against your profile and add the
          opportunity here with a Pursue / Consider / No Bid read, usually within three minutes.
        </div>

        <label style={{ display: 'block', fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
          color: 'var(--ink-fade)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={family === 'sled' ? 'e.g. Lowell Public Schools — HVAC Replacement' : 'e.g. VA Boston — Fiber Backbone Expansion'}
          style={{ width: '100%', marginBottom: 16, boxSizing: 'border-box' }}
          required
        />

        <label style={{ display: 'block', fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
          color: 'var(--ink-fade)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Agency / Buyer <span style={{ opacity: .6, textTransform: 'none' }}>(optional)</span>
        </label>
        <input
          type="text"
          value={agency}
          onChange={e => setAgency(e.target.value)}
          placeholder={family === 'sled' ? 'e.g. City of Lowell' : 'e.g. Department of Veterans Affairs'}
          style={{ width: '100%', marginBottom: 16, boxSizing: 'border-box' }}
        />

        <label style={{ display: 'block', fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
          color: 'var(--ink-fade)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Documents (PDF or DOCX)
        </label>
        <input
          type="file"
          accept=".pdf,.docx"
          multiple
          onChange={handleFileChange}
          style={{ width: '100%', marginBottom: 8, boxSizing: 'border-box' }}
        />
        {files.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--ink-fade)', marginBottom: 16,
            fontFamily: "'IBM Plex Mono', monospace" }}>
            {files.length} file{files.length !== 1 ? 's' : ''} selected
          </div>
        )}

        {error && (
          <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 4,
            background: '#fee2e2', color: '#8b1a1a', fontSize: 13 }}>
            {error}
          </div>
        )}
        {statusMsg && (
          <div style={{ fontSize: 13, color: 'var(--ink-fade)', marginBottom: 16,
            fontFamily: "'IBM Plex Mono', monospace" }}>
            {statusMsg}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onClose} disabled={submitting}
            style={{ background: 'none', border: '1px solid var(--rule)', borderRadius: 4,
              padding: '8px 18px', cursor: submitting ? 'default' : 'pointer' }}>
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit}
            style={{
              background: canSubmit ? 'var(--primary)' : 'var(--rule)',
              color: canSubmit ? '#fff' : 'var(--ink-fade)',
              border: 'none', borderRadius: 4, padding: '8px 18px',
              cursor: canSubmit ? 'pointer' : 'default', fontWeight: 600,
            }}>
            {submitting ? 'Uploading…' : 'Upload and analyze'}
          </button>
        </div>
      </form>
    </div>
  )
}
