// src/hooks/useDemoGate.jsx
//
// Provides the demo-gate state app-wide.
//
//   gateOn = isDemo && (!isInternal || previewAsProspect)
//
// - isDemo            : the active tenant's tenants.is_demo flag (DB)
// - isInternal        : viewer email is @biq-i.com / @winquest.ai
// - previewAsProspect : internal-only toggle ("show me the locked view"),
//                       persisted in localStorage so it survives navigation
//
// While the gate is live, document.body gets the `demo-gated` class so the
// blur/lock CSS in steps 4-5 has a single hook to react to.

import {
  createContext, useContext, useEffect, useMemo, useState, useCallback,
} from 'react';
import { isInternalEmail, gateOn as computeGateOn } from '../lib/demoGate';

const PREVIEW_KEY = 'wq.demo.previewAsProspect';

const DemoGateContext = createContext({
  isDemo: false,
  isInternal: false,
  previewAsProspect: false,
  gateOn: false,
  togglePreview: () => {},
});

export function DemoGateProvider({ supabase, tenantId, children }) {
  const [isInternal, setIsInternal] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [previewAsProspect, setPreviewAsProspect] = useState(() => {
    try { return localStorage.getItem(PREVIEW_KEY) === '1'; } catch { return false; }
  });

  // viewer email -> internal?
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setIsInternal(isInternalEmail(data?.user?.email));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsInternal(isInternalEmail(session?.user?.email));
    });
    return () => { active = false; sub?.subscription?.unsubscribe?.(); };
  }, [supabase]);

  // active tenant -> is_demo?
  useEffect(() => {
    if (!tenantId) { setIsDemo(false); return; }
    let active = true;
    supabase
      .from('tenants')
      .select('is_demo')
      .eq('id', tenantId)
      .single()
      .then(({ data }) => { if (active) setIsDemo(!!data?.is_demo); });
    return () => { active = false; };
  }, [supabase, tenantId]);

  const togglePreview = useCallback(() => {
    setPreviewAsProspect((p) => {
      const next = !p;
      try { localStorage.setItem(PREVIEW_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const gate = computeGateOn({ isDemo, isInternal, previewAsProspect });

  // bridge for CSS / later steps
  useEffect(() => {
    document.body.classList.toggle('demo-gated', gate);
    return () => document.body.classList.remove('demo-gated');
  }, [gate]);

  const value = useMemo(() => ({
    isDemo, isInternal, previewAsProspect, gateOn: gate, togglePreview,
  }), [isDemo, isInternal, previewAsProspect, gate, togglePreview]);

  return (
    <DemoGateContext.Provider value={value}>
      {children}
    </DemoGateContext.Provider>
  );
}

export function useDemoGate() {
  return useContext(DemoGateContext);
}
