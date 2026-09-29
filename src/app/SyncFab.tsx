// زر مزامنة عائم: يدفع/يسحب فوراً ويعرض عدد العمليات المعلقة.

import { useEffect, useState } from 'react';
import { outboxCount } from '@/data/dexie/repos';
import { syncOnce } from '@/data/sync/syncClient';
import { useSession, apiFetch } from '@/data/stores/session';
import { useUi } from '@/data/stores/ui';
import { db } from '@/data/dexie/db';

export function SyncFab() {
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const user = useSession((s) => s.user);
  const toast = useUi((s) => s.toast);

  useEffect(() => {
    if (!user) return;
    void outboxCount().then(setPending);
    const t = setInterval(() => void outboxCount().then(setPending), 5000);
    return () => clearInterval(t);
  }, [user]);

  if (!user) return null;

  return (
    <button
      onClick={async () => {
        setBusy(true);
        const r = await syncOnce();
        // تسجيل الجهاز عند السيرفر مع حالة المنبّه
        try {
          const deviceId = (await db.kv.get('deviceId'))?.value as string | undefined;
          const health = await db.alarmHealth.get(deviceId ?? '');
          await apiFetch(useSession.getState, '/push/register', {
            method: 'POST',
            body: { deviceId: deviceId ?? `dev_${Date.now()}`, platform: health?.platform ?? 'web', alarmHealth: health },
          });
        } catch { /* غير متصل */ }
        setBusy(false);
        const after = await outboxCount();
        setPending(after);
        toast(r.pushed + r.pulled > 0 ? `تمت المزامنة: أُرسل ${r.pushed} واستُلم ${r.pulled}` : 'كل شيء متزامن ✓');
      }}
      className="fixed bottom-28 md:bottom-6 left-4 z-50 rounded-full bg-brand-700 text-white shadow-lg w-14 h-14 flex flex-col items-center justify-center text-[10px] font-bold"
      title="مزامنة الآن"
    >
      <span className={busy ? 'animate-spin text-xl' : 'text-xl'}>⟳</span>
      {pending > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 rounded-full min-w-5 h-5 px-1 flex items-center justify-center">
          {pending}
        </span>
      )}
    </button>
  );
}
