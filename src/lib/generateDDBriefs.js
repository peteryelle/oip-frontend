// src/lib/generateDDBriefs.js
//
// Client-side port of workers/sam/dd_v2_generate_briefs.py. Deliberately
// a straight port, not a reimplementation — badge labels and template
// copy must stay identical to the Python source. If the templates ever
// change, change them in the Python file first and mirror the edit here.
// Same discipline as src/lib/generateBriefs.js (the SLED port this file
// is modeled on).
//
// Pure functions, no network calls — verification (installer_status)
// already happened server-side (dd_v2_verify_handler.py, run separately
// from and after scoring) and is sitting on the oip_signals row by the
// time this runs. Rendering a brief from it is just template lookup.
//
// ASYMMETRIC EXCLUSION, ON PURPOSE — this is the one place this file
// genuinely differs in shape from generateBriefs.js, not just content.
// SLED's NO_BRIEF_OBJECTIVES excludes the SAME states from both brief
// types. DD v2 cannot: partner_won and competitor_won both produce an
// Action Brief but NEVER a Partner Brief, because who ACTS differs by
// state — see NO_PARTNER_BRIEF_STATES below and the Python source's
// module docstring for the full reasoning.

const BADGE_LABELS = {
  open: 'Lead — decision open',
  rfp_found: 'Active RFP — go now',
  partner_won: 'Partner already engaged — convert',
  competitor_won: 'Competitor engaged — direct hardware pitch',
  complete: 'Complete — no action',
}

// States producing NO Action Brief — the "nothing actionable" case only.
// partner_won and competitor_won are deliberately NOT here; they still
// get an Action Brief (see module header).
const NO_ACTION_BRIEF_STATES = new Set(['complete', null, undefined, 'unclassified'])

// States producing NO Partner Brief — wider than the Action Brief
// exclusion set on purpose. partner_won and competitor_won have nothing
// to hand a partner: partner_won means the partner already has the
// work (nothing to hand off), competitor_won means Tessco pitches the
// installer directly (no partner involved at all).
const NO_PARTNER_BRIEF_STATES = new Set([
  'complete', 'partner_won', 'competitor_won', null, undefined, 'unclassified',
])

const ACTION_TEMPLATES = {
  open: {
    pmActions: [
      'Confirm which Tessco partner covers this territory/agency',
      'Package the entailment reasoning (why this project needs ERRCS/DAS) for the partner',
      'Flag the build/recompete timing window so the partner understands the urgency',
    ],
    why: 'No installer engaged yet — the sub-package decision is still open. Early visibility is the entire advantage here; once someone else is engaged, this lead is gone.',
  },
  rfp_found: {
    pmActions: [
      'Confirm the RFP/bid deadline',
      'Get the partner the live solicitation details immediately — this is time-sensitive',
    ],
    why: 'An active, biddable package for this exact scope is open right now. This is the single best-quality signal this pipeline can produce — a confirmed opening, not an inferred one.',
  },
  partner_won: {
    pmActions: [
      'Confirm the win with the partner directly',
      'Move straight to the hardware order conversation — no further lead development needed',
    ],
    why: "The partner already has the install work. There's nothing left to develop here — this converts directly to a hardware order conversation.",
  },
  competitor_won: {
    pmActions: [
      'Contact the installer directly as a hardware prospect',
      'Do NOT frame this as partner-enablement — the install work already went to a different installer',
    ],
    why: 'A competitor installer already won the life-safety/DAS scope on this project. The partner-enablement play is closed, but Tessco can still sell hardware directly to whoever won the install — this is a motion switch, not a dead lead.',
  },
}

// Only "open" and "rfp_found" produce a Partner Brief — see
// NO_PARTNER_BRIEF_STATES above.
const PARTNER_TEMPLATES = {
  open: {
    handToPartner: 'Project brief with the entailment reasoning, agency, and contract value — positioned as a get-ahead-of-it lead, not a live bid. No installer has been engaged as of this check.',
    confirmsBack: "Whether the partner made contact, and their own read on how open the sub-package decision actually is.",
  },
  rfp_found: {
    handToPartner: 'The live RFP/bid details and deadline for this scope, plus the entailment reasoning as supporting context for the proposal.',
    confirmsBack: 'Whether the partner submitted, and the outcome once known.',
  },
}

function projectLabel(award) {
  const scope = award?.award_scope || award?.work_summary
  if (scope) return scope
  if (award?.incumbent_name && award?.agency) return `${award.incumbent_name} — ${award.agency}`
  return award?.piid || 'Untitled award'
}

/**
 * @param {object} award - the b2b_busdev payload for one scored signal
 *   (award_scope/work_summary or incumbent_name+agency, agency,
 *   naics_code, entailment.chain). b2bScore passed separately since it
 *   lives on the oip_signals row, not nested inside b2b_busdev.
 * @param {object} verification - the row written by
 *   dd_v2_verify_handler.py (installer_status; installer_name,
 *   evidence_url, reasoning used if present)
 * @param {number|null} b2bScore - oip_signals.b2b_score
 * @returns {object|null} action brief, or null for non-actionable states
 */
export function generateActionBrief(award, verification, b2bScore = null) {
  const state = verification?.installer_status
  if (NO_ACTION_BRIEF_STATES.has(state)) return null
  const template = ACTION_TEMPLATES[state]
  if (!template) return null

  return {
    state,
    badge: BADGE_LABELS[state] || state,
    project: projectLabel(award),
    agency: award?.agency || null,
    naics: award?.naics_code || null,
    b2bScore,
    pmActions: template.pmActions,
    whyItMovesTheOdds: template.why,
    context: verification?.reasoning || award?.entailment?.chain || null,
    sourceUrl: verification?.evidence_url || null,
    installerName: verification?.installer_name || null,
  }
}

/**
 * Same inputs as generateActionBrief. Returns null for a WIDER set of
 * states than generateActionBrief does — see NO_PARTNER_BRIEF_STATES.
 */
export function generatePartnerBrief(award, verification) {
  const state = verification?.installer_status
  if (NO_PARTNER_BRIEF_STATES.has(state)) return null
  const template = PARTNER_TEMPLATES[state]
  if (!template) return null

  return {
    state,
    badge: BADGE_LABELS[state] || state,
    project: projectLabel(award),
    agency: award?.agency || null,
    naics: award?.naics_code || null,
    handToPartner: template.handToPartner,
    partnerConfirmsBack: template.confirmsBack,
    context: verification?.reasoning || award?.entailment?.chain || null,
    sourceUrl: verification?.evidence_url || null,
  }
}

/**
 * True if this oip_signal has a verification_status worth showing brief
 * buttons for. Mirrors SLED's hasBriefs() — gates the whole Partner
 * Program-style section so it silently doesn't render for unverified
 * awards, the same way that section silently doesn't render today for
 * tenants with no objective classification at all.
 */
export function hasDDBriefs(oipSignal) {
  const state = oipSignal?.verification_status
  return !NO_ACTION_BRIEF_STATES.has(state) && !!ACTION_TEMPLATES[state]
}
