'use client';
import toast from 'react-hot-toast';

type ToastKind = 'success' | 'error' | 'info';

export function notify(message: string, kind: ToastKind = 'info') {
  if (!message) return;
  const options = { duration: kind === 'error' ? 4200 : 2600 };
  if (kind === 'success') toast.success(message, options);
  else if (kind === 'error') toast.error(message, options);
  else toast(message, options);
}

export function confirmAction(message: string, confirmLabel = 'Confirmer', cancelLabel = 'Annuler') {
  if (typeof window === 'undefined') return Promise.resolve(false);
  return new Promise<boolean>(resolve => {
    const id = toast.custom(
      current => (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            width: 'min(340px, calc(100vw - 28px))',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: 18,
            boxShadow: '0 22px 70px rgba(15,23,42,0.22)',
            padding: 14,
            transform: current.visible ? 'translateY(0)' : 'translateY(-8px)',
            opacity: current.visible ? 1 : 0,
            transition: 'opacity .16s ease, transform .16s ease',
          }}
        >
          <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.45, fontWeight: 850 }}>
            {message}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => { toast.dismiss(id); resolve(false); }}
              style={{ border: '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-primary)', borderRadius: 999, padding: '9px 13px', fontSize: 13, fontWeight: 850, cursor: 'pointer' }}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => { toast.dismiss(id); resolve(true); }}
              style={{ border: 'none', background: 'var(--brand)', color: 'var(--accent-text)', borderRadius: 999, padding: '9px 14px', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      ),
      { duration: Infinity, position: 'top-center' },
    );
  });
}
