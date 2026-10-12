// Display labels for a signal's source.
//
// Customer-facing views show WHO the signal is about (the issuing body or
// the utility), never the platform it came from. signals.source holds the
// platform (CivicPlus, BoardDocs, Legistar, primegov_*, puc, ...) and must
// never be rendered. signals.source_name holds the issuing body
// (e.g. "Hull Light Board") and is the default label.
//
// Raw source_name is still the dedup/filter key in the database and in the
// ?entity= URL filter — only the rendered text changes here.

import { UTILITY_BY_SIGNAL } from './utilityLinks'

// Exact source_name -> display label. Add entries as new feeds land.
const LABEL_OVERRIDES = {
  'MA DPU':                          'Massachusetts DPU',
  'CPUC':                            'California PUC',
  'MA DCAMM BidExpress E-Bid Room':  'MA DCAMM',
  'CTsource Bid Board (DAS Procurement)': 'Connecticut DAS Procurement',
  'govcon_dd_v2':                    'Federal Awards',
  'GovCon':                          'Federal Awards',
  'USASpending':                     'Federal Awards',
  'Customer Upload':                 'Uploaded bid package',
  // PUC utility-brand placeholders written by the MA scraper
  'All MA IOUs':                     'Massachusetts DPU',
  'All MA electric IOUs':            'Massachusetts electric utilities',
  'All MA gas IOUs':                 'Massachusetts gas utilities',
}

// Suffixes that leak collection mechanics, stripped from any label.
const STRIP_PATTERNS = [
  /\s*\((api|rss|scrape|feed)\)\s*$/i,
]

function cleanLabel(name) {
  if (!name) return ''
  if (LABEL_OVERRIDES[name]) return LABEL_OVERRIDES[name]
  let out = String(name)
  for (const re of STRIP_PATTERNS) out = out.replace(re, '')
  return out.trim()
}

/**
 * The raw entity name used for grouping and the ?entity= filter.
 * PUC signals group by the utility the proceeding is about (written by the
 * scraper as metadata.utility_brand); everything else by source_name.
 */
export function entityName(sig) {
  if (!sig) return 'Unknown'
  if (sig.source === 'puc' && sig.metadata?.utility_brand) return sig.metadata.utility_brand
  return sig.source_name || 'Unknown'
}

/** Stable grouping key. PUC is keyed per utility so brands don't collapse. */
export function entityKey(sig) {
  if (!sig) return 'Unknown'
  if (sig.source === 'puc' && sig.metadata?.utility_brand) return `puc:${sig.metadata.utility_brand}`
  // Board / procurement signals linked to a canonical utility group by that
  // utility, so a utility's several bodies (board, sub-committee) form one entity.
  const u = sig.id && UTILITY_BY_SIGNAL.get(sig.id)
  if (u && u.length === 1) return `util:${u[0].id}`
  return sig.entity_key || sig.source_name || 'Unknown'
}

/**
 * Human label for a signal (object) or a raw entity/source name (string).
 * Never returns the platform name.
 */
export function displaySource(sigOrName) {
  if (sigOrName == null) return ''
  if (typeof sigOrName === 'string') return cleanLabel(sigOrName)
  return cleanLabel(entityName(sigOrName))
}
