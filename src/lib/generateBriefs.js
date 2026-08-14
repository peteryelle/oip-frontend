// src/lib/generateBriefs.js
//
// Client-side port of workers/sled/generate_briefs.py. Deliberately a
// straight port, not a reimplementation — badge labels and template
// copy must stay identical to the Python source and to what's in
// "The WinQuest Brief: How to Use It". If the templates ever change,
// change them in the Python file first and mirror the edit here.
//
// Pure functions, no network calls — objective classification already
// happened server-side (classify_objective.py, at score time) and is
// sitting on the oip_signals row by the time this runs. Rendering a
// brief from it is just template lookup, so it runs instantly on
// click with no loading state, unlike the LLM-backed Intelligence
// Brief in EntityDrawer.
//
// Partner's own trade (GC, sub, integrator) is never assumed —
// "partner" stays generic throughout. Where a specific role is
// factually known from the signal (sub_outreach's "winning GC/CM" —
// who the board data says won), it's named explicitly; Tessco's own
// partner is not typed.

const BADGE_LABELS = {
  educate: 'Educate',
  influence: 'Influence window open',
  locked: 'Spec locked',
  formal_ask: 'RFP live — formal ask',
  support: 'RFP live — support',
  sub_outreach: 'Sub outreach',
}

const NO_BRIEF_OBJECTIVES = new Set(['suppress', 'unclassified', null, undefined])

const ACTION_TEMPLATES = {
  educate: {
    pmActions: [
      'Identify the partner — existing Tessco relationship or one surfaced through board history',
      "Package the Alyssa's Law / ERRCS content for that partner to deliver",
    ],
    why: 'No competitor to beat yet — the win is being the assumed standard by the time a project starts, not out-bidding someone later.',
  },
  influence: {
    pmActions: [
      'Confirm delivery method (CMAR/CSP vs. low-bid)',
      'Get product and performance-spec language to the partner',
    ],
    why: 'A performance spec written now becomes the baseline every future bidder has to match — arriving first means writing that baseline.',
  },
  locked: {
    pmActions: [
      'Prepare case studies and performance data',
      'Draft an approved-equal addendum request',
    ],
    why: 'Last point a spec can be amended without a formal RFI process — narrower and faster than waiting for the RFP window.',
  },
  formal_ask: {
    pmActions: [
      "Confirm the RFI/question deadline hasn't passed",
      'Prep the substitution request language',
    ],
    why: "Last lever that can still change what's biddable — after this, the spec is fixed for every bidder.",
  },
  support: {
    pmActions: [
      "Assemble pricing and technical backup for the partner's bid",
    ],
    why: "Doesn't change the spec, but converts a lost influence fight into a supply win instead of a total loss.",
  },
  sub_outreach: {
    pmActions: [
      'Identify the winning GC/CM from the signal',
      'Identify which Tessco partner can pursue inclusion under that GC/CM',
    ],
    why: "The board already decided who's building — the only remaining lever is making sure Tessco's product rides along with them via the right partner.",
  },
}

const PARTNER_TEMPLATES = {
  educate: {
    handToPartner: "Tessco Inside education kit — Alyssa's Law + ERRCS compliance narrative, positioned as a district standard, not a project-specific pitch.",
    confirmsBack: 'A meeting happened with the board or facilities team, and roughly how it landed.',
  },
  influence: {
    handToPartner: 'Product and performance-spec language sized to this project, for the partner to pass directly to the architect, plus a delivery-method checklist.',
    confirmsBack: 'Confirmation that product information was shared with the architect, and roughly when.',
  },
  locked: {
    handToPartner: 'Case studies and performance data for board/partner review, plus a drafted approved-equal addendum request, ready to send.',
    confirmsBack: 'Whether the addendum request was filed, and the date.',
  },
  formal_ask: {
    handToPartner: 'A written substitution/equal request, drafted and ready to file through the RFI process before the question deadline.',
    confirmsBack: 'A copy or confirmation of the filed request, and the date it was submitted.',
  },
  support: {
    handToPartner: "Pricing, quotes, and technical backup sized to help the partner's bid.",
    confirmsBack: 'Bid outcome (won/lost), and whether Tessco product was included in the submission.',
  },
  sub_outreach: {
    handToPartner: "The winning GC/CM's identity and project details, so the partner can pursue getting DAS/BDA/ERRCS scope included under them — not a pitch to the winning GC/CM itself.",
    confirmsBack: 'Whether the partner made contact with the winning GC/CM, and the outcome if known.',
  },
}

function projectLabel(oipSignal, signal) {
  const projectRef = oipSignal.project_ref
  const phaseRef = oipSignal.phase_ref
  if (projectRef && phaseRef) return `${projectRef} — ${phaseRef}`
  if (projectRef) return projectRef
  return signal?.title || 'Untitled signal'
}

/**
 * @param {object} signal - the joined `signals` record (title, source_name, doc_url)
 * @param {object} oipSignal - the oip_signals row (objective, project_ref, phase_ref, why_now, objective_deadline_unknown)
 * @returns {object|null} action brief, or null for non-actionable objectives
 */
export function generateActionBrief(signal, oipSignal) {
  const objective = oipSignal.objective
  if (NO_BRIEF_OBJECTIVES.has(objective)) return null
  const template = ACTION_TEMPLATES[objective]
  if (!template) return null

  return {
    objective,
    badge: BADGE_LABELS[objective] || objective,
    project: projectLabel(oipSignal, signal),
    district: signal?.source_name || null,
    pmActions: template.pmActions,
    whyItMovesTheOdds: template.why,
    context: oipSignal.why_now || null,
    sourceUrl: signal?.doc_url || null,
    deadlineUnknown: !!oipSignal.objective_deadline_unknown,
  }
}

/**
 * Same inputs as generateActionBrief. Returns null for the same
 * non-actionable objectives — nothing to hand off if there was
 * nothing to do.
 */
export function generatePartnerBrief(signal, oipSignal) {
  const objective = oipSignal.objective
  if (NO_BRIEF_OBJECTIVES.has(objective)) return null
  const template = PARTNER_TEMPLATES[objective]
  if (!template) return null

  return {
    objective,
    badge: BADGE_LABELS[objective] || objective,
    project: projectLabel(oipSignal, signal),
    district: signal?.source_name || null,
    handToPartner: template.handToPartner,
    partnerConfirmsBack: template.confirmsBack,
    context: oipSignal.why_now || null,
    sourceUrl: signal?.doc_url || null,
    deadlineUnknown: !!oipSignal.objective_deadline_unknown,
  }
}

/** True if this oip_signal has an objective worth showing brief buttons for. */
export function hasBriefs(oipSignal) {
  return !NO_BRIEF_OBJECTIVES.has(oipSignal?.objective) && !!ACTION_TEMPLATES[oipSignal?.objective]
}
