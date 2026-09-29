// ui/components — نظام مكونات صغير: أزرار، بطاقات، حقول، نوافذ،
// Snackbar (مع تراجع)، تأكيد حذف، شريط تقدم، شارات، وحالات فارغة.
// RTL بالكامل، لون teal.

import { useEffect, type ReactNode } from 'react';
import clsx from 'clsx';
import { useUi } from '@/data/stores/ui';

export function Button({
  children, onClick, variant = 'primary', className, type = 'button', disabled, full,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'soft';
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
  full?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50',
        variant === 'primary' && 'bg-brand-700 text-white hover:bg-brand-800',
        variant === 'soft' && 'bg-brand-50 text-brand-800 hover:bg-brand-100 border border-brand-200',
        variant === 'ghost' && 'text-gray-700 hover:bg-gray-100',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        full && 'w-full',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'rounded-2xl bg-white border border-gray-200 shadow-sm',
        onClick && 'cursor-pointer hover:border-brand-300',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="text-gray-600 font-medium">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="text-xs text-gray-400">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white';

export function Modal({ open, title, onClose, children, wide }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className={clsx(
          'bg-white w-full rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between border-b border-gray-100 px-4 py-3 z-10">
          <h3 className="font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-2">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Badge({ children, color = 'gray' }: { children: ReactNode; color?: 'gray' | 'green' | 'yellow' | 'orange' | 'red' | 'teal' }) {
  const map = {
    gray: 'bg-gray-100 text-gray-600',
    green: 'bg-green-100 text-green-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    orange: 'bg-orange-100 text-orange-800',
    red: 'bg-red-100 text-red-800',
    teal: 'bg-brand-50 text-brand-800',
  };
  return <span className={clsx('inline-block rounded-full px-2 py-0.5 text-xs font-medium', map[color])}>{children}</span>;
}

export function Progress({ ratio, color }: { ratio: number; color?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return (
    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
      <div
        className={clsx('h-full rounded-full transition-all',
          color === 'green' && 'bg-green-500',
          color === 'yellow' && 'bg-yellow-500',
          color === 'orange' && 'bg-orange-500',
          color === 'red' && 'bg-red-500',
          !color && 'bg-brand-600')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Empty({ icon, title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="text-center py-12 text-gray-400">
      <div className="text-4xl mb-2">{icon ?? '🗂️'}</div>
      <div className="font-medium text-gray-500">{title}</div>
      {hint && <div className="text-sm mt-1">{hint}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2 mt-4">
      <h2 className="font-bold text-gray-700">{children}</h2>
      {action}
    </div>
  );
}

/** مضيف Snackbar — زر التراجع يبقى 10 ثوانٍ ثم تختفي الرسالة */
export function SnackbarHost() {
  const { snackbars, dismiss } = useUi();
  useEffect(() => {
    const timers = snackbars.map((s) => setTimeout(() => dismiss(s.id), s.durationMs));
    return () => timers.forEach(clearTimeout);
  }, [snackbars, dismiss]);
  return (
    <div className="fixed bottom-20 sm:bottom-6 inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {snackbars.map((s) => (
        <div key={s.id} className="pointer-events-auto flex items-center gap-4 rounded-xl bg-gray-900 text-white px-4 py-3 shadow-lg max-w-md w-full">
          <span className="text-sm flex-1">{s.text}</span>
          {s.actionLabel && (
            <button
              className="text-brand-300 font-bold text-sm"
              onClick={() => {
                s.onAction?.();
                dismiss(s.id);
              }}
            >
              {s.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** مضيف نوافذ التأكيد — يستخدمه كل حذف (الأعراض والطعام أيضاً) */
export function ConfirmHost() {
  const confirm = useUi((s) => s.confirm);
  if (!confirm) return null;
  return (
    <Modal open title={confirm.title} onClose={() => { confirm.resolve(false); useUi.setState({ confirm: null }); }}>
      <p className="text-sm text-gray-600 leading-6">{confirm.message}</p>
      <div className="flex gap-2 mt-4 justify-start">
        <Button
          variant={confirm.danger ? 'danger' : 'primary'}
          onClick={() => { confirm.resolve(true); useUi.setState({ confirm: null }); }}
        >
          {confirm.confirmLabel ?? 'تأكيد'}
        </Button>
        <Button variant="ghost" onClick={() => { confirm.resolve(false); useUi.setState({ confirm: null }); }}>
          إلغاء
        </Button>
      </div>
    </Modal>
  );
}

/** نمط صف قابل للتمرير للحذف على الموبايل (swipe-to-delete) */
export function SwipeRow({ children, onDelete, disabled }: { children: ReactNode; onDelete: () => void; disabled?: boolean }) {
  let startX = 0;
  let dx = 0;
  return (
    <div
      className="relative overflow-hidden rounded-2xl touch-pan-y"
      onTouchStart={(e) => { startX = e.touches[0].clientX; dx = 0; }}
      onTouchMove={(e) => { dx = e.touches[0].clientX - startX; }}
      onTouchEnd={() => {
        if (!disabled && dx > 80) onDelete(); // سحب من اليسار لليمين في RTL = حذف
        else if (!disabled && dx < -80) onDelete();
      }}
    >
      {children}
    </div>
  );
}
