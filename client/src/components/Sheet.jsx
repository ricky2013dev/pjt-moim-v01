import { useEffect } from 'react';
import Icon from './Icon.jsx';

// Page scroll is locked while any sheet is open. A counter (rather than saving and
// restoring the previous style) keeps stacked sheets, e.g. an editor plus its delete
// confirmation, from leaving the page stuck unscrollable after they close.
let openSheets = 0;
function lockScroll() {
  openSheets += 1;
  document.documentElement.style.overflow = 'hidden';
  return () => {
    openSheets = Math.max(0, openSheets - 1);
    if (!openSheets) document.documentElement.style.overflow = '';
  };
}

// Bottom sheet on phones, centered dialog on larger screens.
export default function Sheet({ open, onClose, title, children, footer }) {
  useEffect(() => (open ? lockScroll() : undefined), [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-cream shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="-mr-2 rounded-full p-2 text-muted hover:bg-white" aria-label="Close">
            <Icon name="x" className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="pb-safe border-t border-line px-5 pt-3 pb-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ open, title, message, confirmLabel = 'Delete', danger = true, busy, onConfirm, onCancel }) {
  return (
    <Sheet open={open} onClose={onCancel} title={title}
      footer={
        <div className="grid grid-cols-2 gap-3">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className={danger ? 'btn bg-red-600 text-white hover:bg-red-700' : 'btn-primary'} disabled={busy} onClick={onConfirm}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      }>
      <p className="text-muted">{message}</p>
    </Sheet>
  );
}
