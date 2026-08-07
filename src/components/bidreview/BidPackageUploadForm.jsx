// src/components/bidreview/BidPackageUploadForm.jsx
//
// Standalone Bid/No-Bid package submission: customer types a title + agency
// (this is NOT a signal WinQuest already tracks — no linked-signal path yet,
// see App.jsx MarketReviewPage for the isBidReview scope note) and uploads
// the solicitation document set. On submit:
//   1. Insert a `signals` row (metadata.signal_type='document_upload',
//      standalone=true) under the given OIP's vertical.
//   2. Upload each file directly to Storage bucket `bid-documents-raw` at
//      {tenant_id}/{oip_id}/{signal_id}/{filename} — this is the exact path
//      convention the RLS policy and the worker handler both expect.
//   3. Write the real storage paths back into signals.metadata.uploaded_documents.
//   4. Queue a `document_review` worker_jobs row.
//
// The result itself is NOT rendered here — MarketReviewPage's Realtime
// subscription picks up the oip_signals INSERT once the worker finishes
// (~20-30s for a single-document package, longer for digest+synthesize on a
// large set) and the card appears in the board automatically. This form's
// job ends at "successfully queued."
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const BUCKET = 'bid-documents-raw'

// Storage object keys reject some characters — conservative allowlist rather
// than trying to enumerate what's disallowed.
function sanitizeFilename(name) {
  return (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
}

export default function BidPackageUploadForm({ oipId, tenantId, oipSlug, verticalId, onUploaded, onClose }) {
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
      // 1. Create the signal
      setStatusMsg('Creating package…')
      const { data: signal, error: sigErr } = await supabase
        .from('signals')
        .insert({
          vertical_id: verticalId,
          source_id: `upload-${crypto.randomUUID()}`,
          source_name: 'Customer Upload',
          state: null,
          title: title.trim(),
          metadata: {
            signal_type: 'document_upload',
            standalone: true,
            agency: agency.trim(),
            uploaded_documents: [],
          },
        })
        .select('id')
        .single()
      if (sigErr) throw new Error(`Could not create package: ${sigErr.message}`)
      const signalId = signal.id

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
        uploadedDocs.push({ filename, storage_path: path })
      }

      // 3. Write the real paths back into the signal's metadata
      setStatusMsg('Finalizing…')
      const { error: metaErr } = await supabase
        .from('signals')
        .update({
          metadata: {
            signal_type: 'document_upload',
            standalone: true,
            agency: agency.trim(),
            uploaded_documents: uploadedDocs,
          },
        })
        .eq('id', signalId)
      if (metaErr) throw new Error(`Could not attach documents: ${metaErr.message}`)

      // 4. Queue the review job
      const { error: jobErr } = await supabase
        .from('worker_jobs')
        .insert({
          job_type: 'document_review',
          oip_id: oipId,
          vertical_id: verticalId,
          status: 'queued',
          payload: { signal_id: signalId, oip_slug: oipSlug },
        })
      if (jobErr) throw new Error(`Could not queue analysis: ${jobErr.message}`)

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
          New Bid Package
        </div>
        <div style={{
          fontFamily: "'Spectral', Georgia, serif", fontSize: 22, fontWeight: 600,
          color: 'var(--ink)', marginBottom: 20,
        }}>
          Upload for Bid/No-Bid review
        </div>

        <label style={{ display: 'block', fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
          color: 'var(--ink-fade)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. City of Austin — Fiber Backbone Expansion"
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
          placeholder="e.g. Austin Energy"
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
            {submitting ? 'Uploading…' : 'Submit for Review'}
          </button>
        </div>
      </form>
    </div>
  )
}
