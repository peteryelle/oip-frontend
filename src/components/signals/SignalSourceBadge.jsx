/**
 * SignalSourceBadge
 * =================
 * Small monospace badge showing which vertical a signal came from.
 * Color-coded by vertical type.
 */

const VERTICAL_CONFIG = {
  oe417:  { label: 'OE-417',  bg: '#fef3c7', color: '#92400e' },
  grants: { label: 'Grants',  bg: '#dcfce7', color: '#166534' },
  puc:    { label: 'PUC',     bg: '#dbeafe', color: '#1e40af' },
  sam:    { label: 'SAM',     bg: '#ede9fe', color: '#5b21b6' },
  sled:   { label: 'SLED',    bg: '#f1f5f9', color: '#475569' },
  ferc:   { label: 'FERC',    bg: '#fce7f3', color: '#9d174d' },
  nerc:   { label: 'NERC',    bg: '#fce7f3', color: '#9d174d' },
}

export default function SignalSourceBadge({ verticalSlug, style = {} }) {
  const cfg = VERTICAL_CONFIG[verticalSlug] || {
    label: (verticalSlug || 'Unknown').toUpperCase(),
    bg: '#f1f5f9',
    color: '#475569',
  }

  return (
    <span style={{
      display:        'inline-block',
      padding:        '3px 10px',
      borderRadius:   3,
      fontSize:       12,
      fontWeight:     700,
      fontFamily:     "'IBM Plex Mono', monospace",
      letterSpacing:  '.08em',
      background:     cfg.bg,
      color:          cfg.color,
      whiteSpace:     'nowrap',
      ...style,
    }}>
      {cfg.label}
    </span>
  )
}
