// features/inventory — صفحة المخزون الكاملة:
//  • إجمالي المتبقي مع تفصيل العبوات (علب + أشرطة + أقراص، أو قوارير/مل)
//  • عدد الجرعات المتبقية + عدد الأقراص في الجرعة + عدد الجرعات اليومية
//  • المدة المتبقية: «باقي X يوم / ينتهي يوم Y» بألوان أخضر/أصفر/برتقالي/أحمر وشريط تقدم
//  • تصحيح يدوي وإضافة رصيد، وسجل أحداث المخزون، وتنبيه انتهاء العلبة.

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/dexie/db';
import { refill } from '@/data/dexie/repos';
import { useSettings } from '@/data/stores/settings';
import { useUi } from '@/data/stores/ui';
import type { Med } from '@/core/schema/types';
import {
  computeBalance, dosesRemaining, expectedDailyUsage, foldBalance,
  progressRatio, stockStatus, unitLabelAr, STOCK_COLORS,
} from '@/core/engine/inventory';
import { localDayKey, formatDayKeyAr } from '@/core/time';
import { Badge, Button, Card, Empty, Field, Modal, Progress, SectionTitle, inputCls } from '@/ui/components';

export function InventoryPage() {
  const { tz, policy, activePersonId } = useSettings();
  const meds = useLiveQuery(() => db.meds.toArray(), []) ?? [];
  const schedules = useLiveQuery(() => db.schedules.toArray(), []) ?? [];
  const doseEvents = useLiveQuery(() => db.doseEvents.toArray(), []) ?? [];
  const today = localDayKey(new Date(), tz);
  const visible = meds.filter((m) => !m.deletedAt && (!activePersonId || m.personId === activePersonId));
  const [detail, setDetail] = useState<Med | null>(null);

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800">المخزون</h1>
      <p className="text-sm text-gray-400">حساب مباشر من أحداث الجرعات والإضافات — بتوقيت {tz}</p>

      {visible.length === 0 && <Empty icon="📦" title="لا أدوية لعرض مخزونها" />}

      <div className="space-y-3 mt-3">
        {visible.map((m) => (
          <StockCard
            key={m.id}
            med={m}
            schedules={schedules}
            doseEvents={doseEvents}
            today={today}
            thresholds={m.lowStockDays ?? policy.lowStockThresholdDays}
            tz={tz}
            onOpen={() => setDetail(m)}
          />
        ))}
      </div>

      {detail && (
        <StockDetail
          med={detail}
          schedules={schedules}
          doseEvents={doseEvents}
          today={today}
          thresholds={detail.lowStockDays ?? policy.lowStockThresholdDays}
          tz={tz}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

interface SchedLite {
  medId: string;
  active: boolean;
  deletedAt?: number | null;
  times: string[];
  doseSize: number;
  daysOfWeek?: number[];
}

function StockCard({ med, schedules, doseEvents, today, thresholds, tz, onOpen }: {
  med: Med;
  schedules: SchedLite[];
  doseEvents: { medId: string; status: string; amount: number; dayKey: string }[];
  today: string;
  thresholds: number[];
  tz: string;
  onOpen: () => void;
}) {
  const inv = useLiveQuery(() => db.inventoryEvents.where('medId').equals(med.id).toArray(), [med.id]) ?? [];
  const balance = computeBalance(inv);
  const perDay = expectedDailyUsage(med, schedules, doseEvents, today, diffDays(tz));
  const st = stockStatus(balance, med, perDay, today, thresholds, addDays, diffDays(tz));
  const folded = foldBalance(balance, med);
  const dailyDosesCount = schedules.filter((s) => s.medId === med.id && s.active && !s.deletedAt).reduce((n, s) => n + s.times.length, 0);
  const doseAmount = schedules.find((s) => s.medId === med.id && s.active && !s.deletedAt)?.doseSize;
  // متوسط حجم الجرعة الفعلي (يشمل أنصاف الأقراص) = الاستهلاك اليومي ÷ عدد الجرعات اليومية
  const avgDose = dailyDosesCount > 0 && perDay > 0 ? perDay / dailyDosesCount : doseAmount ?? 0;
  const remainingDoses = dosesRemaining(balance, avgDose);
  const packExpired = med.packExpiry && med.packExpiry < Date.now();

  return (
    <Card className="p-4" onClick={onOpen}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-bold text-gray-800">{med.nameAr} <span className="text-xs text-gray-400 nums">{med.strength}</span></div>
          <div className="text-sm text-gray-500 mt-1">{folded.text}</div>
        </div>
        <Badge color={STOCK_COLORS[st.level] as 'green' | 'yellow' | 'orange' | 'red'}>
          {st.level === 'ok' ? 'المخزون جيد'
            : st.level === 'low' ? `ينخفض — ≤${thresholds[0]} يوم`
            : st.level === 'warning' ? `تحذير — ≤${thresholds[1]} يوم`
            : 'حرج'}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <Metric label="الرصيد" value={`${balance}`} unit={unitLabelAr(med)} />
        <Metric label="جرعات متبقية" value={`${remainingDoses}`} unit="جرعة" />
        <Metric label={med.prn ? 'استخدام/يوم (تقديري)' : 'جرعات/يوم'} value={med.prn ? `${perDay || '—'}` : `${dailyDosesCount}`} unit={med.prn ? unitLabelAr(med) : 'جرعة'} />
      </div>

      {doseAmount !== undefined && (
        <p className="text-xs text-gray-400 mt-2">
          الجرعة: {doseAmount} {unitLabelAr(med)} × {dailyDosesCount} يومياً
          {perDay > 0 ? ` — يستهلك ~${Math.round(perDay * 100) / 100} ${unitLabelAr(med)}/يوم` : ''}
        </p>
      )}

      <div className="mt-3">
        <Progress ratio={progressRatio(balance, perDay)} color={STOCK_COLORS[st.level]} />
        <div className="flex justify-between text-xs mt-1">
          {st.daysRemaining !== null ? (
            <>
              <span className={st.level === 'critical' ? 'text-red-600 font-bold' : 'text-gray-600'}>
                باقي ~{st.daysRemaining} يوم
              </span>
              <span className="text-gray-400">ينتهي يوم {formatDayKeyAr(st.depletionDayKey!)}</span>
            </>
          ) : (
            <span className={balance <= 0 ? 'text-red-600 font-bold' : 'text-gray-400'}>
              {balance <= 0 ? 'المخزون فارغ — أضف رصيداً' : 'بلا جدول — يُحسب عند الاستخدام'}
            </span>
          )}
        </div>
      </div>

      {packExpired && (
        <p className="text-xs text-red-600 mt-2">⚠ انتهت صلاحية العلبة الحالية ({med.packExpiry ? formatDayKeyAr(localDayKey(new Date(med.packExpiry), tz)) : ''})</p>
      )}
      {st.urgent && (
        <p className="text-xs text-red-700 font-bold mt-1">🚨 دواء هام قارب النفاد — أُرسل تنبيه عاجل للأجهزة الأخرى</p>
      )}
    </Card>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-xl bg-gray-50 py-2">
      <div className="font-bold nums text-gray-800">{value} <span className="text-[10px] font-normal text-gray-400">{unit}</span></div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  );
}

function StockDetail({ med, schedules, doseEvents, today, thresholds, tz, onClose }: {
  med: Med;
  schedules: SchedLite[];
  doseEvents: { medId: string; status: string; amount: number; dayKey: string }[];
  today: string;
  thresholds: number[];
  tz: string;
  onClose: () => void;
}) {
  const { askConfirm, undoable } = useUi();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const inv = useLiveQuery(() => db.inventoryEvents.where('medId').equals(med.id).reverse().toArray(), [med.id]) ?? [];
  const balance = computeBalance(inv);
  const perDay = expectedDailyUsage(med, schedules, doseEvents, today, diffDays(tz));
  const folded = foldBalance(balance, med);

  const add = async (delta: number, reason: 'refill' | 'manual') => {
    const v = Math.abs(Number(amount));
    if (!v) return;
    const signed = reason === 'manual' ? -v : v;
    const yes = reason === 'manual'
      ? await askConfirm('تصحيح يدوي', `خصم ${v} ${unitLabelAr(med)} من رصيد ${med.nameAr}؟ (مثال: أقراص سقطت، جرعة مضاعفة)`)
      : true;
    if (!yes) return;
    await refill(med.familyId, med.id, signed, reason, note || undefined);
    undoable(reason === 'manual' ? 'تم التصحيح اليدوي' : 'أُضيف الرصيد', async () => {
      await refill(med.familyId, med.id, -signed, 'manual', 'تراجع');
    });
    setAmount(''); setNote('');
  };

  return (
    <Modal open title={`مخزون ${med.nameAr}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="rounded-xl bg-brand-50 p-3 text-sm">
          <div className="font-bold text-brand-900">{folded.text}</div>
          <div className="text-xs text-brand-800 nums">الإجمالي: {balance} {unitLabelAr(med)}</div>
        </div>

        <SectionTitle>إضافة رصيد / تصحيح</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <Field label="الكمية"><input className={inputCls} type="number" step="0.5" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="ملاحظة"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void add(Number(amount), 'refill')} disabled={!amount}>+ إضافة (شريت علبة جديدة)</Button>
          <Button variant="soft" onClick={() => void add(Number(amount), 'manual')} disabled={!amount}>− تصحيح يدوي (خصم)</Button>
        </div>

        <SectionTitle>سجل المخزون</SectionTitle>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {inv.map((e) => (
            <div key={e.id} className="flex justify-between text-sm border-b border-gray-50 py-1.5">
              <span>
                <span className={e.delta >= 0 ? 'text-green-700 nums' : 'text-red-600 nums'}>
                  {e.delta >= 0 ? '+' : ''}{e.delta} {unitLabelAr(med)}
                </span>
                <span className="text-gray-400 text-xs mr-2">
                  {e.reason === 'refill' ? 'إضافة' : e.reason === 'dose' ? 'جرعة' : e.reason === 'expiry' ? 'انتهاء' : 'تصحيح'}
                  {e.note ? ` · ${e.note}` : ''}
                </span>
              </span>
              <span className="text-xs text-gray-300">{new Date(e.at).toLocaleString('ar-EG')}</span>
            </div>
          ))}
          {inv.length === 0 && <p className="text-sm text-gray-400">لا أحداث بعد — أضف رصيدك الحالي بـ «إضافة».</p>}
        </div>
        <p className="text-xs text-gray-400">
          نصيحة: أضف رصيدك الحالي الآن ليبدأ العدّاد من صحته. عتبات التنبيه: {thresholds.join('/')} يوم.
        </p>
      </div>
    </Modal>
  );
}

function addDays(k: string, n: number): string {
  const [y, m, d] = k.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function diffDays(tz: string) {
  return (a: string, b: string): number => {
    const toUtc = (k: string) => {
      const [y, m, d] = k.split('-').map(Number);
      return Date.UTC(y, m - 1, d);
    };
    void tz;
    return Math.round((toUtc(a) - toUtc(b)) / 86_400_000);
  };
}
