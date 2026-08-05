// src/components/demo/DemoIndicator.jsx
//
// Section-nav pill. Renders ONLY for internal viewers inside a demo tenant.
// Tells you whether the prospect is currently seeing the locked view, and
// toggles "preview as prospect" so you see exactly what they see.

import { useDemoGate } from '../../hooks/useDemoGate';

export default function DemoIndicator() {
  const { isDemo, isInternal, previewAsProspect, togglePreview } = useDemoGate();

  // Prospects and non-demo tenants never see this control.
  if (!isDemo || !isInternal) return null;

  const previewing = previewAsProspect;

  return (
    <button
      type="button"
      onClick={togglePreview}
      title={previewing
        ? 'You are seeing the prospect view. Click to return to full access.'
        : 'Prospect sees the locked demo view. Click to preview what they see.'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        marginLeft: 'auto',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.6,
        cursor: 'pointer',
        userSelect: 'none',
        border: '1px solid',
        borderColor: previewing ? '#b45309' : '#1d4ed8',
        background: previewing ? '#fffbeb' : '#eff6ff',
        color: previewing ? '#b45309' : '#1d4ed8',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: previewing ? '#f59e0b' : '#3b82f6',
        }}
      />
      {previewing ? 'Viewing as prospect' : 'Demo · prospect locked'}
    </button>
  );
}
