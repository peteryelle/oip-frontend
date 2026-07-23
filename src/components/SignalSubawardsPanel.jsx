import React, { useState } from 'react';
import { ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

export function SignalSubawardsPanel({ b2b_subawards }) {
  const [expandedSubs, setExpandedSubs] = useState(new Set());
  const [showErrors, setShowErrors] = useState(false);

  if (!b2b_subawards?.subawards || b2b_subawards.subawards.length === 0) {
    return null;
  }

  const enrichment = b2b_subawards;
  const subs = b2b_subawards.subawards;
  const totalValue = subs.reduce((sum, s) => sum + (s.subaward_amount || 0), 0);

  const toggleSubExpanded = (idx) => {
    const newSet = new Set(expandedSubs);
    newSet.has(idx) ? newSet.delete(idx) : newSet.add(idx);
    setExpandedSubs(newSet);
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-gradient-to-br from-slate-50 to-slate-100">
      <h3 className="font-semibold text-lg text-gray-800">
        Prime Contractor Supply Chain
      </h3>

      {/* Prime Info Card */}
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1">
            <p className="font-semibold text-gray-900">{enrichment.prime_name}</p>
            <p className="text-xs text-gray-600">PIID: {enrichment.prime_piid}</p>
          </div>
          {enrichment.prime_poc && (
            <div className="text-right text-sm bg-blue-50 p-3 rounded">
              <p className="font-medium text-gray-900">{enrichment.prime_poc.name}</p>
              <p className="text-xs text-gray-700">{enrichment.prime_poc.title}</p>
              <p className="text-xs text-gray-600">
                {enrichment.prime_poc.city}, {enrichment.prime_poc.state}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Agency Contracting Officer */}
      {enrichment.agency_co && (
        <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-300">
          <p className="text-xs font-semibold text-blue-900 uppercase tracking-wide mb-2">
            Agency Contracting Officer
          </p>
          <div className="space-y-1">
            <p className="font-semibold text-blue-900">{enrichment.agency_co.name}</p>
            <p className="text-sm text-blue-800">{enrichment.agency_co.department}</p>
            <p className="text-xs text-blue-700">
              📍 {enrichment.agency_co.location_city}, {enrichment.agency_co.location_state}
            </p>
            <p className="text-xs text-blue-700">
              <a href={`mailto:${enrichment.agency_co.email}`} className="underline hover:text-blue-900">
                {enrichment.agency_co.email}
              </a>
            </p>
            {enrichment.agency_co.phones?.length > 0 && (
              <p className="text-xs text-blue-700">☎️ {enrichment.agency_co.phones.join(', ')}</p>
            )}
          </div>
        </div>
      )}

      {/* Subawards Summary */}
      <div className="p-3 bg-white rounded-lg border border-blue-200">
        <p className="text-sm font-semibold text-gray-800">
          {subs.length} Sub-Vendors · ${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </p>
      </div>

      {/* Subawards List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {subs.map((sub, idx) => (
          <div key={idx} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {/* Header */}
            <button
              onClick={() => toggleSubExpanded(idx)}
              className="w-full p-3 text-left hover:bg-gray-50 flex justify-between items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{sub.subawardee_name}</p>
                <p className="text-xs text-gray-600">UEI: {sub.subawardee_uei}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-green-700">
                  ${sub.subaward_amount?.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-gray-500">{sub.subaward_date}</p>
                {expandedSubs.has(idx) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>

            {/* Expanded Content */}
            {expandedSubs.has(idx) && (
              <div className="border-t border-gray-200 bg-gray-50 p-3 space-y-3">
                {/* Scope (the key insight) */}
                {sub.subaward_description && (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 uppercase mb-1">
                      What They Do
                    </p>
                    <p className="text-sm text-gray-700 bg-white p-2 rounded border border-gray-200">
                      {sub.subaward_description}
                    </p>
                  </div>
                )}

                {/* Sub Details */}
                {sub.subawardee_business_types && (
                  <p className="text-xs text-gray-600">
                    <span className="font-semibold">Type:</span> {sub.subawardee_business_types}
                  </p>
                )}

                {/* Sub POC */}
                {sub.sub_poc && (
                  <div className="bg-indigo-50 p-3 rounded border border-indigo-200">
                    <p className="text-xs font-semibold text-indigo-900 uppercase mb-1">
                      POC
                    </p>
                    <p className="font-medium text-indigo-900">{sub.sub_poc.name}</p>
                    <p className="text-xs text-indigo-700">{sub.sub_poc.title}</p>
                    {sub.sub_poc.city && (
                      <p className="text-xs text-indigo-600 mt-1">
                        {sub.sub_poc.city}, {sub.sub_poc.state}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Errors */}
      {enrichment.enrichment_errors?.length > 0 && (
        <div className="p-3 bg-red-50 rounded-lg border border-red-200">
          <button
            onClick={() => setShowErrors(!showErrors)}
            className="flex items-center gap-2 text-sm font-semibold text-red-700 w-full"
          >
            <AlertCircle size={16} />
            {enrichment.enrichment_errors.length} Warning(s)
            {showErrors ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showErrors && (
            <div className="mt-2 space-y-1">
              {enrichment.enrichment_errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600">• {e}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
