// Tenant type — what this company sells. Drives Derived Demand gap analysis
// in the worker (dd_v2_brief_handler.py reads profile data.tenant_type):
// which public evidence counts as "the prime buys this" and what "the prime
// does it in-house" means.
//
// Stored on the TENANT-CANONICAL profile row (the row the worker reads), as
// data.tenant_type. Same read-modify-write pattern as CompetitorsBlock.
import { supabase } from './supabase'

export const TENANT_TYPES = [
  {
    value: 'product',
    label: 'Product',
    definition: 'You sell something buyers use or license: software, a platform, equipment.',
  },
  {
    value: 'service',
    label: 'Service',
    definition: 'You sell work your people perform: strategy, creative, engineering, installation, consulting.',
  },
  {
    value: 'media_seller',
    label: 'Media seller',
    definition: 'You sell audience reach on media you own or represent: publications, broadcast, digital properties, ad inventory.',
  },
]

export const TENANT_TYPE_VALUES = TENANT_TYPES.map(t => t.value)

// Fired after a successful save so the login gate re-checks without a reload.
export const TENANT_TYPE_EVENT = 'wq-tenant-type-changed'

export function tenantTypeLabel(value) {
  return TENANT_TYPES.find(t => t.value === value)?.label || null
}

// Returns { rowId, value }. value is null when unset or unrecognised.
// rowId is null when the tenant has no canonical profile row (nothing to save to).
export async function loadTenantType(oipId) {
  const { data: canon, error } = await supabase.rpc('get_canonical_profile_row', { p_oip_id: oipId })
  if (error) throw error
  const row = Array.isArray(canon) ? canon[0] : canon
  const raw = row?.data?.tenant_type
  const value = TENANT_TYPE_VALUES.includes(raw) ? raw : null
  return { rowId: row?.id || null, value }
}

// Merges only tenant_type into the freshest copy of the row's data, so a
// concurrent write to other keys (worker, another editor) is not overwritten.
export async function saveTenantType(rowId, value) {
  if (!rowId) throw new Error('No tenant profile to save to.')
  if (!TENANT_TYPE_VALUES.includes(value)) throw new Error('Choose product, service or media seller.')
  const { data: fresh, error: readErr } = await supabase
    .from('profiles').select('data').eq('id', rowId).single()
  if (readErr) throw readErr
  const data = {
    ...(fresh?.data || {}),
    tenant_type: value,
    tenant_type_updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('profiles').update({ data }).eq('id', rowId)
  if (error) throw error
  window.dispatchEvent(new CustomEvent(TENANT_TYPE_EVENT, { detail: { value } }))
}
