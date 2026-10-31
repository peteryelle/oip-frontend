// src/components/ModuleBanner.jsx
// One-line description of the module shown under the breadcrumb on
// /market (SAM OIPs only), /demand and /radar. Copy approved 2026-10-31.

const BLURBS = {
  market:
    'Federal opportunities matched to what you sell, scored and briefed so your team spends its time on the pursuits worth chasing.',
  demand:
    'Sell to the winner, not the government. Federal contracts recently awarded, and those heading toward recompete, where the prime will need help delivering or a partner to win again, each with a brief on how you fill the gap.',
  radar:
    'Federal contracts in your space coming up for recompete, months before the RFP posts, with a read on how the incumbent is performing so you can position your own bid early.',
}

export default function ModuleBanner({ section, selectedOip }) {
  const slug = selectedOip?.slug || ''
  const isSam = selectedOip?.verticals?.slug === 'sam'

  if (section === 'market') {
    const isDirectSam = isSam && !slug.endsWith('-derived') && !slug.endsWith('-recompete')
    if (!isDirectSam) return null
  }

  const text = BLURBS[section]
  if (!text) return null

  return (
    <p
      className="module-banner"
      style={{
        margin: '0 24px 16px',
        padding: '10px 14px',
        maxWidth: 880,
        borderLeft: '3px solid var(--primary)',
        background: 'var(--primary-soft)',
        color: 'var(--ink)',
        fontSize: 14,
        lineHeight: 1.5,
        borderRadius: 2,
      }}
    >
      {text}
    </p>
  )
}
