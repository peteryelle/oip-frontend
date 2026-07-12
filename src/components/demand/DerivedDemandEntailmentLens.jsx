import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';

export default function DerivedDemandEntailmentLens({ oip, sentinel, onSave }) {
  const { user, memberships } = useAuth();
  const [lens, setLens] = useState(sentinel?.pull_config?.custom_entailment_lens || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isLocked, setIsLocked] = useState(sentinel?.pull_config?.custom_entailment_locked || false);
  const [isSaving, setIsSaving] = useState(false);
  const [lockedBy, setLockedBy] = useState(sentinel?.pull_config?.custom_entailment_locked_by || null);
  const [lockedAt, setLockedAt] = useState(sentinel?.pull_config?.custom_entailment_locked_at || null);

  // Check if current user is operator (owner)
  const membership = memberships?.find(m => m.tenant_id === oip?.tenant_id);
  const isOperator = membership?.role === 'owner' || membership?.role === 'admin';

  useEffect(() => {
    if (sentinel?.pull_config) {
      setLens(sentinel.pull_config.custom_entailment_lens || '');
      setIsLocked(sentinel.pull_config.custom_entailment_locked || false);
      setLockedBy(sentinel.pull_config.custom_entailment_locked_by || null);
      setLockedAt(sentinel.pull_config.custom_entailment_locked_at || null);
    }
  }, [sentinel]);

  const handleSaveAndLock = async () => {
    if (!confirm('Save and lock this entailment lens? Only an owner can unlock it for edits.')) return;

    setIsSaving(true);
    const newPC = {
      ...sentinel.pull_config,
      custom_entailment_lens: lens,
      custom_entailment_locked: true,
      custom_entailment_locked_by: 'tenant',
      custom_entailment_locked_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('sentinels')
      .update({ pull_config: newPC })
      .eq('id', sentinel.id);

    if (error) {
      alert('Error saving: ' + error.message);
      setIsSaving(false);
      return;
    }

    setIsLocked(true);
    setLockedBy('tenant');
    setLockedAt(new Date().toISOString());
    setIsEditing(false);
    setIsSaving(false);
    onSave?.();
  };

  const handleUnlock = async () => {
    if (!isOperator) {
      alert('Only an owner can unlock the lens.');
      return;
    }

    if (!confirm('Unlock this lens for tenant editing?')) return;

    const newPC = {
      ...sentinel.pull_config,
      custom_entailment_locked: false,
    };

    const { error } = await supabase
      .from('sentinels')
      .update({ pull_config: newPC })
      .eq('id', sentinel.id);

    if (error) {
      alert('Error unlocking: ' + error.message);
      return;
    }

    setIsLocked(false);
    setLockedBy(null);
    alert('Lens unlocked. Tenant can now edit.');
    onSave?.();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div style={{
      padding: '20px',
      background: 'var(--bg)',
      borderRadius: '6px',
      border: '1px solid var(--rule)',
      marginTop: '20px',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
      }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
          Custom Entailment Lens
        </h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{
            fontSize: '12px',
            color: isLocked ? 'var(--success)' : 'var(--warn)',
            fontWeight: 600,
          }}>
            {isLocked ? '🔒 LOCKED' : '🔓 UNLOCKED'}
          </span>
        </div>
      </div>

      {isLocked && (
        <div style={{
          marginBottom: '12px',
          padding: '12px',
          background: 'rgba(0,200,100,.05)',
          borderLeft: '3px solid var(--success)',
          borderRadius: '3px',
          fontSize: '12px',
          color: 'var(--ink-fade)',
          lineHeight: '1.5',
        }}>
          <div>
            <strong>Locked by tenant</strong> on {formatDate(lockedAt)}
          </div>
          {isOperator && (
            <button
              onClick={handleUnlock}
              style={{
                marginTop: '8px',
                cursor: 'pointer',
                color: 'var(--primary)',
                textDecoration: 'underline',
                border: 'none',
                background: 'none',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              ↻ Unlock for tenant edit
            </button>
          )}
        </div>
      )}

      {isEditing ? (
        <>
          <textarea
            value={lens}
            onChange={(e) => setLens(e.target.value)}
            style={{
              width: '100%',
              minHeight: '400px',
              padding: '12px',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '13px',
              border: '1px solid var(--rule)',
              borderRadius: '3px',
              marginBottom: '12px',
              boxSizing: 'border-box',
              background: 'var(--bg-alt)',
              color: 'var(--ink-base)',
              lineHeight: '1.5',
            }}
            placeholder="## Concrete Entailment&#10;&#10;Enter the tenant-specific entailment lens..."
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleSaveAndLock}
              disabled={isSaving}
              style={{
                padding: '8px 16px',
                background: 'var(--primary)',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                opacity: isSaving ? 0.6 : 1,
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {isSaving ? 'Saving...' : 'Save & Lock'}
            </button>
            <button
              onClick={() => setIsEditing(false)}
              style={{
                padding: '8px 16px',
                background: 'var(--bg-alt)',
                color: 'var(--ink-base)',
                border: '1px solid var(--rule)',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <pre
            style={{
              background: 'var(--bg-alt)',
              padding: '12px',
              borderRadius: '3px',
              fontSize: '12px',
              lineHeight: '1.6',
              overflow: 'auto',
              maxHeight: '500px',
              margin: '0 0 12px 0',
              color: 'var(--ink-light)',
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            {lens || '(No custom lens yet — will use auto-generated lens)'}
          </pre>
          {!isLocked && (
            <button
              onClick={() => setIsEditing(true)}
              style={{
                padding: '8px 16px',
                background: 'var(--primary)',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              ✎ Edit Lens
            </button>
          )}
        </>
      )}
    </div>
  );
}
