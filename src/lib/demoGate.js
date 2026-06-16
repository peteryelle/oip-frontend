// src/lib/demoGate.js
//
// Demo gate — the prospect-facing blurred/locked view.
//
// The gate is ACTIVE when:  tenant.is_demo === true
//                           AND (viewer is not internal OR viewer is previewing as a prospect)
//
// When active, each result row resolves to one of three access levels:
//   'teaser' — the single showcase row (highest score in the open band, or a manual pin):
//              gated column sharp, drawer opens fully.
//   'locked' — score > LOCK_AT: gated column blurred, drawer click blocked.
//   'open'   — score <= LOCK_AT: drawer opens, but the gated column is still blurred
//              (only the teaser ever shows the gated column sharp).
//
// Components derive two booleans from the access level:
//   columnBlurred = gateOn && access !== 'teaser'
//   drawerBlocked = gateOn && access === 'locked'

// --- Internal viewer detection -------------------------------------------

const INTERNAL_DOMAINS = ['biq-i.com', 'winquest.ai'];

export function isInternalEmail(email) {
  if (!email) return false;
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return INTERNAL_DOMAINS.includes(domain);
}

// --- Thresholds (single source of truth) ---------------------------------

export const LOCK_AT = 50;    // score strictly greater than this is locked
export const TEASER_LO = 70;  // teaser score strictly greater than this ...
export const TEASER_HI = 75;  // ... and strictly less than this

// Optional manual teaser pins. Set to a row id to force a specific showcase
// row regardless of the band; leave null to auto-pick highest in (LO, HI).
export const TEASER_PIN = { b2g: null, b2b: null };

// --- Helpers --------------------------------------------------------------

// B2G score (signal_value) arrives as text; B2B (b2b_score) as int. Coerce.
export function toScore(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// Is the master gate on for this viewer/tenant/preview combination?
export function gateOn({ isDemo, isInternal, previewAsProspect }) {
  return !!isDemo && (!isInternal || !!previewAsProspect);
}

// Pick the teaser row id for a table.
//   rows    — the full (unfiltered) row set, so the teaser stays stable as the
//             prospect filters/sorts.
//   idOf    — (row) => stable id
//   scoreOf — (row) => raw score value (text or number)
//   pin     — optional forced id (TEASER_PIN.b2g / .b2b)
export function pickTeaserId(rows, idOf, scoreOf, pin = null) {
  if (pin && rows.some((r) => idOf(r) === pin)) return pin;
  let best = null;
  let bestScore = -Infinity;
  for (const r of rows) {
    const s = toScore(scoreOf(r));
    if (s == null) continue;
    if (s > TEASER_LO && s < TEASER_HI && s > bestScore) {
      best = idOf(r);
      bestScore = s;
    }
  }
  return best;
}

// Resolve one row's access level. teaserId comes from pickTeaserId().
// Returns 'teaser' | 'locked' | 'open'.
export function rowAccess(score, isTeaser) {
  if (isTeaser) return 'teaser';
  const s = toScore(score);
  if (s != null && s > LOCK_AT) return 'locked';
  return 'open';
}
