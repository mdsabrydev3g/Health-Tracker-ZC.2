// features/more — المزيد: الوضع والإشعارات، صحة المنبّه، المزامنة،
// العائلة والحسابات، النسخ الاحتياطية المشفرة، إعدادات AI، الخروج.

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, kvGet } from '@/data/dexie/db';
import { useSettings } from '@/data/stores/settings';
import { useSession, apiFetch } from '@/data/stores/session';
import { useUi } from '@/data/stores/ui';
import { syncOnce } from '@/data/sync/syncClient';
import { encryptBackup, decryptBackup } from '@/core/sync/backup';
import { refreshAlarmHealth, runNotificationCycle } from '@/data/notify/service';
import { aiAvailability } from '@/data/ai/client';
import { Badge, Button, Card, Field, SectionTitle, inputCls } from '@/ui/components';

export function MorePage() {
  const { mode, setMode, policy, setPolicy, aiEnabled, setAiEnabled } = useSettings();
  const { user, logout, serverBase, setServerBase } = useSession();
  const { toast, undoable } = useUi();
  const alarmHealth = useLiveQuery(() => db.alarmHealth.toArray(), []) ?? [];
  const [family, setFamily] = useState<{ name: string; inviteCode?: string } | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [aiStatus, setAiStatus] = useState<{ providers: { id: string; available: boolean }[]; any: boolean } | null>(null);
  const [base, setBase] = useState(serverBase);

  useEffect(() => {
    void (async () => {
      setLastSync((await kvGet<number>('lastSyncAt')) ?? null);
      if (user) {
        try {
          const me = await apiFetch<{ family?: { name: string; inviteCode?: string } }>(useSession.getState, '/auth/me');
          setFamily(me.family ?? null);
        } catch { /* offline */ }
      }
    })();
  }, [user]);

  useEffect(() => {
    void aiAvailability().then(setAiStatus);
  }, [aiEnabled]);

  const doBackup = async () => {
    const password = prompt('كلمة مرور لتشفير النسخة الاحتياطية (لا تُرسل للسيرفر):');
    if (!password) return;
    try {
      const data = JSON.stringify({
        meds: await db.meds.toArray(),
        schedules: await db.schedules.toArray(),
        doseEvents: (await db.doseEvents.toArray()).slice(-5000),
        inventoryEvents: (await db.inventoryEvents.toArray()).slice(-5000),
        labResults: await db.labResults.toArray(),
        symptoms: await db.symptoms.toArray(),
        foodLogs: await db.foodLogs.toArray(),
        persons: await db.persons.toArray(),
        gtins: await db.gtins.toArray(),
        at: Date.now(),
      });
      const cipher = await encryptBackup(data, password);
      await apiFetch(useSession.getState, '/backup/store', { method: 'POST', body: { cipher } });
      toast('أُنشئت نسخة احتياطية مشفّرة على السيرفر ✓');
    } catch (e) {
      toast(`فشل إنشاء النسخة: ${(e as Error).message}`);
    }
  };

  const restoreBackup = async () => {
    try {
      const list = await apiFetch<{ backups: { id: string; createdAt: number }[] }>(useSession.getState, '/backup/list');
      if (!list.backups.length) {
        toast('لا نسخ احتياطية محفوظة');
        return;
      }
      const password = prompt('كلمة مرور النسخة الاحتياطية:');
      if (!password) return;
      const bk = await apiFetch<{ cipher: string }>(useSession.getState, `/backup/get?id=${list.backups[0].id}`);
      const json = await decryptBackup(bk.cipher, password);
      const data = JSON.parse(json) as Record<string, unknown[]>;
      let restored = 0;
      for (const [table, rows] of Object.entries(data)) {
        if (!Array.isArray(rows)) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const t = (db as any)[table];
        if (!t) continue;
        await t.bulkPut(rows);
        restored += rows.length;
      }
      undoable(`استُرجع ${restored} سجل من النسخة الاحتياطية`, async () => { /* لا تراجع للاسترجاع الكامل */ });
      void runNotificationCycle();
    } catch (e) {
      toast(`فشل الاسترجاع: ${(e as Error).message}`);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800">المزيد</h1>
      <p className="text-sm text-gray-400">{user?.name} · {mode === 'mother' ? 'وضع الوالدة' : 'وضع المالك'}</p>

      <SectionTitle>الوضع والإشعارات</SectionTitle>
      <Card className="p-4 space-y-3">
        <div className="flex gap-2">
          <Button variant={mode === 'owner' ? 'primary' : 'soft'} onClick={() => void setMode('owner')}>وضع المالك/الابن</Button>
          <Button variant={mode === 'mother' ? 'primary' : 'soft'} onClick={() => void setMode('mother')}>وضع الوالدة</Button>
        </div>
        <p className="text-xs text-gray-500 leading-5">
          الوالدة: منبّه صوتي لكل جرعة + إشعارات لكل نفاد. المالك: إشعارات فقط،
          والتنبيه العاجل فقط عند نفاد دواء هام.
        </p>
        <Field label="عتبات النفاد المتدرجة (يوم)" hint="مثال: 7، 3، 1 — يمكن تعديلها">
          <div className="flex gap-2 items-center">
            {[0, 1, 2].map((i) => (
              <input
                key={i}
                type="number"
                min={1}
                className={inputCls + ' w-20'}
                value={policy.lowStockThresholdDays[i] ?? ''}
                onChange={(e) => {
                  const arr = [...policy.lowStockThresholdDays];
                  arr[i] = Number(e.target.value) || arr[i];
                  void setPolicy({ lowStockThresholdDays: arr });
                }}
              />
            ))}
            <Button variant="ghost" onClick={() => void runNotificationCycle()}>فحص الآن</Button>
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={policy.notifyPerDose} onChange={(e) => void setPolicy({ notifyPerDose: e.target.checked })} />
          إشعار عند أخذ/فوات الجرعات (بين الأجهزة)
        </label>
      </Card>

      <SectionTitle>صحة المنبّه على هذا الجهاز</SectionTitle>
      <Card className="p-4 space-y-2 text-sm">
        {alarmHealth.slice(0, 1).map((h) => (
          <div key={h.deviceId} className="space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">المنصة</span><span>{h.platform}</span></div>
            <div className="flex justify-between">
              <span className="text-gray-500">إذن الإشعارات</span>
              <Badge color={h.notificationsPermission === 'granted' ? 'green' : 'red'}>
                {h.notificationsPermission === 'granted' ? 'مسموح' : h.notificationsPermission === 'denied' ? 'مرفوض' : 'لم يُطلب'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">آخر جدولة</span>
              <span className="text-xs">{h.lastScheduledAt ? new Date(h.lastScheduledAt).toLocaleString('ar-EG') : '—'}</span>
            </div>
            {h.platform === 'android' && (
              <p className="text-[11px] text-gray-400 leading-5">
                أندرويد: اضبط «منبّهات دقيقة» و«استثناء من تحسين البطارية» لإصوات مضمونة.
                يعيد التطبيق الجدولة تلقائياً بعد إعادة تشغيل الجهاز عند فتحه.
              </p>
            )}
            {h.platform !== 'android' && (
              <p className="text-[11px] text-gray-400 leading-5">
                على الويب/سطح المكتب: التنبيهات الفورية تعمل والتطبيق مفتوح.
                للتطبيق المغلق تُستخدم إشعارات Web Push من السيرفر.
                على iOS يقيّد النظام المنبّهات المستمرة — تُستخدم إشعارات متكررة (موثق في الأدلة).
              </p>
            )}
          </div>
        ))}
        <Button variant="soft" onClick={() => void refreshAlarmHealth()}>إعادة فحص الأذونات</Button>
      </Card>

      <SectionTitle>المزامنة والعائلة</SectionTitle>
      <Card className="p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">آخر مزامنة</span>
          <span className="text-xs">{lastSync ? new Date(lastSync).toLocaleString('ar-EG') : '—'}</span>
        </div>
        {family?.inviteCode && (
          <div className="flex justify-between items-center">
            <span className="text-gray-500">رمز دعوة (للوالدة)</span>
            <code className="bg-brand-50 text-brand-800 rounded-lg px-2 py-1 font-bold tracking-widest">{family.inviteCode}</code>
          </div>
        )}
        <Field label="عنوان السيرفر البديل" hint="لتطبيق سطح المكتب المصدَّر ثابتاً — اتركه فارغاً للنسخة الأونلاين">
          <input className={inputCls} value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://your-app.vercel.app" />
        </Field>
        <Button variant="soft" onClick={() => void setServerBase(base.trim())}>حفظ عنوان السيرفر</Button>
      </Card>

      <SectionTitle>النسخ الاحتياطية المشفرة</SectionTitle>
      <Card className="p-4 space-y-2">
        <p className="text-xs text-gray-500 leading-5">
          تُشفَّر النسخة على جهازك (AES-256-GCM) بمفتاح من كلمة مرور تختارها —
          السيرفر يخزّن نصاً مشفّراً لا يستطيع قراءته. آخر 10 نسخ فقط.
        </p>
        <div className="flex gap-2">
          <Button onClick={() => void doBackup()}>إنشاء نسخة احتياطية</Button>
          <Button variant="soft" onClick={() => void restoreBackup()}>استرجاع آخر نسخة</Button>
        </div>
      </Card>

      <SectionTitle>المساعد الذكي (AI)</SectionTitle>
      <Card className="p-4 space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={aiEnabled} onChange={(e) => void setAiEnabled(e.target.checked)} />
          تفعيل ميزات الذكاء الاصطناعي
        </label>
        <p className="text-xs text-gray-500 leading-5">
          المفاتيح على السيرفر فقط. يُطلب موافقتك قبل إرسال أي ملف/نص لمزود خارجي.
          السلسلة: Gemini ← Groq ← OpenRouter (:free) ← Pollinations.
        </p>
        {aiStatus && (
          <div className="flex gap-1 flex-wrap">
            {aiStatus.providers.map((p) => (
              <Badge key={p.id} color={p.available ? 'green' : 'gray'}>{p.id}{p.available ? ' ✓' : ' —'}</Badge>
            ))}
          </div>
        )}
      </Card>

      <SectionTitle>الحساب</SectionTitle>
      <Card className="p-4">
        <Button variant="danger" onClick={() => void logout()}>تسجيل خروج</Button>
      </Card>

      <p className="text-center text-[11px] text-gray-300 mt-8">
        رفيق الصحة v2.0 — بيانات صحية خاصة: كل عائلة معزولة عن غيرها، والسجل التاريخي لا يُمسح (حذف ناعم + أحداث append-only).
      </p>
    </div>
  );
}
