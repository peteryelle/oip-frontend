// src/components/OipDescription.jsx
// Customer-facing description of the selected OIP, shown in the blue hero
// on the Market Review page. SAM, Derived Demand and Pipeline Radar copy
// approved 2026-10-31; SLED two-lane copy approved 2026-10-31.

const DESCRIPTIONS = {
  sam:
    'Federal opportunities matched to what you sell, scored and briefed so your team spends its time on the pursuits worth chasing.',
  derived:
    'Sell to the winner, not the government. Federal contracts recently awarded, and those heading toward recompete, where the prime will need help delivering or a partner to win again, each with a brief on how you fill the gap.',
  recompete:
    'Federal contracts in your space coming up for recompete, months before the RFP posts, with a read on how the incumbent is performing so you can position your own bid early.',
  sled:
    'State and local opportunities matched to what you sell, in two lanes. Early emerging: projects still taking shape, before an RFP is written, so you can get in front of the buyer. Procurement: open bids you can pursue now. Each comes with a brief on why it fits.',
}

export function oipDescriptionKey(selectedOip, { isSled = false } = {}) {
  const slug = selectedOip?.slug || ''
  const vertical = selectedOip?.verticals?.slug
  if (slug.endsWith('-derived')) return 'derived'
  if (slug.endsWith('-recompete')) return 'recompete'
  if (vertical === 'sam') return 'sam'
  if (isSled) return 'sled'
  return null
}

export default function OipDescription({ selectedOip, isSled = false }) {
  const key = oipDescriptionKey(selectedOip, { isSled })
  const text = key ? DESCRIPTIONS[key] : null
  if (!text) return null
  return (
    <p
      className="hero-desc"
      style={{
        margin: '10px 0 0',
        maxWidth: 760,
        fontSize: 15,
        lineHeight: 1.55,
        color: 'inherit',
        opacity: 0.92,
      }}
    >
      {text}
    </p>
  )
}
