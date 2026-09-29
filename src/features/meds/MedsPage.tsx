// features/meds — قائمة الأدوية والجداول: زر تعديل وحذف ظاهر على كل عنصر،
// تحديد متعدد وحذف جماعي، Undo بعد الحذف، مسح علبة (GS1)، وتأكيد قبل الحذف.

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/dexie/db';
import { bulkSoftDelete, softDelete, upsert, newId, learnGtin } from '@/data/dexie/repos';
import { useSettings } from '@/data/stores/settings';
import { useSession } from '@/data/stores/session';
import { useUi } from '@/data/stores/ui';
import type { Med, MedForm, Schedule } from '@/core/schema/types';
import { scheduledDailyUsage } from '@/core/engine/inventory';
import { formatTimeAr } from '@/core/time';
import { Badge, Button, Card, Empty, Field, Modal, SectionTitle, SwipeRow, inputCls } from '@/ui/components';
import { ScanDialog } from './ScanDialog';

const FORMS: { id: MedForm; label: string }[] = [
  { id: 'tablet', label: 'قرص' },
  { id: 'capsule', label: 'كبسولة' },
  { id: 'syrup', label: 'شراب' },
  { id: 'drops', label: 'قطرة' },
  { id: 'injection', label: 'حقن' },
  { id: 'inhaler', label: 'بخاخ' },
  { id: 'other', label: 'أخرى' },
];

export function MedsPage() {
  const meds = useLiveQuery(() => db.meds.toArray(), []) ?? [];
  const schedules = useLiveQuery(() => db.schedules.toArray(), []) ?? [];
  const { activePersonId } = useSettings();
  const { undoable, askConfirm } = useUi();
  const [editing, setEditing] = useState<Med | 'new' | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scheduleFor, setScheduleFor] = useState<Med | null>(null);

  const visible = meds.filter((m) => !m.deletedAt && (!activePersonId || m.personId === activePersonId));

  const deleteMed = async (m: Med) => {
    const yes = await askConfirm('حذف دواء', `حذف «${m.nameAr}» وكل جداوله؟ ستجده 30 يوماً في سلة المحذوفات.`);
    if (!yes) return;
    const scheds = schedules.filter((s) => s.medId === m.id && !s.deletedAt);
    await softDelete('meds', m.id);
    for (const s of scheds) await softDelete('schedules', s.id);
    undoable(`حُذف «${m.nameAr}»`, async () => {
      await restoreMed(m, scheds);
    });
  };

  const restoreMed = async (m: Med, scheds: Schedule[]) => {
    await upsert('meds', { ...m, deletedAt: null });
    for (const s of scheds) await upsert('schedules', { ...s, deletedAt: null });
  };

  const bulkDelete = async () => {
    const items = visible.filter((m) => selected.has(m.id));
    const yes = await askConfirm('حذف جماعي', `حذف ${items.length} دواءً؟ يمكن التراجع أو الاسترجاع من السلة.`);
    if (!yes) return;
    await bulkSoftDelete('meds', items.map((m) => m.id));
    for (const m of items) {
      for (const s of schedules.filter((s) => s.medId === m.id && !s.deletedAt)) {
        await softDelete('schedules', s.id);
      }
    }
    undoable(`حُذفت ${items.length} أدوية`, async () => {
      for (const m of items) await restoreMed(m, []);
    });
    setSelected(new Set());
    setBulk(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-800">الأدوية والجداول</h1>
        <div className="flex gap-2">
          <Button variant={bulk ? 'danger' : 'ghost'} onClick={() => { setBulk(!bulk); setSelected(new Set()); }}>
            {bulk ? `حذف (${selected.size})` : 'تحديد'}
          </Button>
          <Button variant="soft" onClick={() => setScanOpen(true)}>مسح علبة</Button>
          <Button onClick={() => setEditing('new')}>+ دواء</Button>
        </div>
      </div>

      {visible.length === 0 && <Empty icon="💊" title="لا أدوية بعد" hint="أضف أول دواء أو امسح علبة الدواء بالكاميرا" />}

      <div className="space-y-2 mt-3">
        {visible.map((m) => (
          <SwipeRow key={m.id} onDelete={() => void deleteMed(m)}>
            <Card className="p-3">
              <div className="flex items-center gap-3">
                {bulk && (
                  <input
                    type="checkbox"
                    checked={selected.has(m.id)}
                    onChange={(e) => {
                      const s = new Set(selected);
                      if (e.target.checked) s.add(m.id); else s.delete(m.id);
                      setSelected(s);
                    }}
                    className="w-4 h-4"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-gray-800">{m.nameAr}</span>
                    {m.strength && <span className="text-xs text-gray-500 nums">{m.strength}</span>}
                    {m.isImportant && <Badge color="red">هام</Badge>}
                    {m.isChronic && <Badge color="teal">مزمن</Badge>}
                    {m.prn && <Badge color="yellow">عند اللزوم</Badge>}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {FORMS.find((f) => f.id === m.form)?.label}
                    {m.activeIngredient ? ` · ${m.activeIngredient}` : ''}
                    {m.gtin ? ' · باركود ✓' : ''}
                  </div>
                  <div className="text-xs text-brand-700 mt-0.5">
                    {(() => {
                      const mine = schedules.filter((s) => s.medId === m.id && !s.deletedAt && s.active);
                      if (!mine.length) return m.prn ? 'عند اللزوم — بلا جدول' : 'بلا جدول نشط';
                      return mine.map((s) => `${s.times.map(formatTimeAr).join('، ')} — ${s.doseSize}`).join(' | ');
                    })()}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button variant="ghost" className="!py-1 !px-2 text-xs" onClick={() => setEditing(m)}>تعديل</Button>
                  <Button variant="ghost" className="!py-1 !px-2 text-xs text-red-600" onClick={() => void deleteMed(m)}>حذف</Button>
                  {!m.prn && (
                    <Button variant="ghost" className="!py-1 !px-2 text-xs" onClick={() => setScheduleFor(m)}>جدول</Button>
                  )}
                </div>
              </div>
            </Card>
          </SwipeRow>
        ))}
      </div>

      {bulk && visible.length > 0 && (
        <div className="fixed bottom-24 md:bottom-6 inset-x-0 flex justify-center z-50">
          <Button variant="danger" onClick={() => void bulkDelete()}>حذف المحدد ({selected.size})</Button>
        </div>
      )}

      {editing && (
        <MedFormDialog
          med={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {scheduleFor && (
        <ScheduleDialog med={scheduleFor} schedules={schedules.filter((s) => s.medId === scheduleFor.id && !s.deletedAt)} onClose={() => setScheduleFor(null)} />
      )}
      {scanOpen && (
        <ScanDialog
          onClose={() => setScanOpen(false)}
          onLearned={async (entry) => { await learnGtin(entry); }}
        />
      )}
    </div>
  );
}

// ============================================================
// نافذة إضافة/تعديل دواء
// ============================================================

function MedFormDialog({ med, onClose }: { med: Med | null; onClose: () => void }) {
  const user = useSession((s) => s.user);
  const { activePersonId } = useSettings();
  const toast = useUi((s) => s.toast);
  const [f, setF] = useState<Partial<Med>>(med ?? {
    form: 'tablet', doseUnit: 'tablet', isImportant: false, isChronic: false, prn: false,
    presentation: { tabletsPerBlister: 10, blistersPerBox: 2 },
  });
  const set = (patch: Partial<Med>) => setF((x) => ({ ...x, ...patch }));
  const isLiquid = f.doseUnit === 'ml' || f.doseUnit === 'drop';

  const save = async () => {
    if (!user || !f.nameAr?.trim()) return;
    const row: Med = {
      id: med?.id ?? newId('med'),
      familyId: med?.familyId ?? user.familyId,
      personId: med?.personId ?? (activePersonId || user.personId || user.familyId),
      nameAr: f.nameAr.trim(),
      nameEn: f.nameEn?.trim() || undefined,
      activeIngredient: f.activeIngredient?.trim() || undefined,
      strength: f.strength?.trim() || undefined,
      form: f.form ?? 'tablet',
      doseUnit: f.doseUnit ?? 'tablet',
      isImportant: f.isImportant ?? false,
      isChronic: f.isChronic ?? false,
      prn: f.prn ?? false,
      prnMaxPerDay: f.prnMaxPerDay,
      prnReasonHint: f.prnReasonHint,
      presentation: f.presentation,
      barcode: f.barcode,
      gtin: f.gtin,
      packExpiry: f.packExpiry,
      packBatch: f.packBatch,
      lowStockDays: f.lowStockDays,
      notes: f.notes,
      createdAt: med?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      deletedAt: null,
    };
    await upsert('meds', row);
    toast(med ? 'عُدّل الدواء ✓' : 'أُضيف الدواء ✓');
    onClose();
  };

  return (
    <Modal open title={med ? 'تعديل دواء' : 'إضافة دواء'} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        <Field label="الاسم (عربي) *"><input className={inputCls} value={f.nameAr ?? ''} onChange={(e) => set({ nameAr: e.target.value })} /></Field>
        <Field label="الاسم (إنجليزي)"><input className={inputCls} value={f.nameEn ?? ''} onChange={(e) => set({ nameEn: e.target.value })} /></Field>
        <Field label="المادة الفعالة"><input className={inputCls} value={f.activeIngredient ?? ''} onChange={(e) => set({ activeIngredient: e.target.value })} /></Field>
        <Field label="التركيز" hint="مثل 500 mg"><input className={inputCls} value={f.strength ?? ''} onChange={(e) => set({ strength: e.target.value })} /></Field>
        <Field label="الشكل">
          <select className={inputCls} value={f.form} onChange={(e) => {
            const form = e.target.value as MedForm;
            set({
              form,
              doseUnit: form === 'syrup' ? 'ml' : form === 'drops' ? 'drop' : form === 'injection' ? 'unit' : 'tablet',
            });
          }}>
            {FORMS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </Field>
        <Field label="الوسوم">
          <div className="flex gap-3 text-sm py-2">
            <label className="flex items-center gap-1"><input type="checkbox" checked={f.isImportant ?? false} onChange={(e) => set({ isImportant: e.target.checked })} /> هام</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={f.isChronic ?? false} onChange={(e) => set({ isChronic: e.target.checked })} /> مزمن</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={f.prn ?? false} onChange={(e) => set({ prn: e.target.checked })} /> عند اللزوم</label>
          </div>
        </Field>
        {f.prn && (
          <>
            <Field label="حد PRN اليومي"><input className={inputCls} type="number" min={1} value={f.prnMaxPerDay ?? ''} onChange={(e) => set({ prnMaxPerDay: Number(e.target.value) })} /></Field>
            <Field label="سبب الاستخدام"><input className={inputCls} value={f.prnReasonHint ?? ''} onChange={(e) => set({ prnReasonHint: e.target.value })} /></Field>
          </>
        )}
      </div>

      <SectionTitle>تفصيل العبوة (لعرض المخزون)</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        {!isLiquid ? (
          <>
            <Field label="أقراص بالشريط"><input className={inputCls} type="number" min={0} value={f.presentation?.tabletsPerBlister ?? ''} onChange={(e) => set({ presentation: { ...f.presentation, tabletsPerBlister: Number(e.target.value) } })} /></Field>
            <Field label="شرائط بالعلبة"><input className={inputCls} type="number" min={0} value={f.presentation?.blistersPerBox ?? ''} onChange={(e) => set({ presentation: { ...f.presentation, blistersPerBox: Number(e.target.value) } })} /></Field>
          </>
        ) : (
          <Field label="سعة القارورة (مل)"><input className={inputCls} type="number" min={0} value={f.presentation?.mlPerBottle ?? ''} onChange={(e) => set({ presentation: { ...f.presentation, mlPerBottle: Number(e.target.value) } })} /></Field>
        )}
        <Field label="باركود/GTIN"><input className={inputCls} value={f.barcode ?? f.gtin ?? ''} onChange={(e) => set({ barcode: e.target.value, gtin: e.target.value })} /></Field>
      </div>

      <div className="flex gap-2 mt-4">
        <Button full onClick={() => void save()}>حفظ</Button>
        <Button variant="ghost" onClick={onClose}>إلغاء</Button>
      </div>
    </Modal>
  );
}

// ============================================================
// نافذة جدول الجرعات
// ============================================================

function ScheduleDialog({ med, schedules, onClose }: { med: Med; schedules: Schedule[]; onClose: () => void }) {
  const user = useSession((s) => s.user);
  const toast = useUi((s) => s.toast);
  const { askConfirm, undoable } = useUi();
  const [times, setTimes] = useState<string[]>(schedules[0]?.times ?? ['08:00']);
  const [doseSize, setDoseSize] = useState(String(schedules[0]?.doseSize ?? 1));
  const [days, setDays] = useState<number[] | undefined>(schedules[0]?.daysOfWeek);
  const [active, setActive] = useState(schedules[0]?.active ?? true);

  const DAYS = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

  const save = async () => {
    if (!user) return;
    const existing = schedules[0];
    const row: Schedule = {
      id: existing?.id ?? newId('sch'),
      familyId: user.familyId,
      personId: med.personId,
      medId: med.id,
      times: times.filter(Boolean),
      doseSize: Number(doseSize) || 1,
      daysOfWeek: days,
      startDate: existing?.startDate ?? Date.now(),
      endDate: existing?.endDate,
      active,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      deletedAt: null,
    };
    await upsert('schedules', row);
    toast('حُفظ الجدول ✓');
    onClose();
  };

  const deleteSchedule = async () => {
    const s = schedules[0];
    if (!s) return;
    const yes = await askConfirm('حذف الجدول', `حذف جدول ${med.nameAr}؟`);
    if (!yes) return;
    await softDelete('schedules', s.id);
    undoable('حُذف الجدول', async () => { await upsert('schedules', { ...s, deletedAt: null }); });
    onClose();
  };

  return (
    <Modal open title={`جدول ${med.nameAr}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="الأوقات">
          <div className="space-y-2">
            {times.map((t, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input type="time" className={inputCls} value={t} onChange={(e) => setTimes(times.map((x, j) => (j === i ? e.target.value : x)))} />
                {times.length > 1 && <Button variant="ghost" onClick={() => setTimes(times.filter((_, j) => j !== i))}>✕</Button>}
              </div>
            ))}
            <Button variant="soft" onClick={() => setTimes([...times, '20:00'])}>+ وقت</Button>
          </div>
        </Field>
        <Field label="حجم الجرعة" hint={`بوحدة: ${med.doseUnit === 'tablet' ? 'أقراص (0.5 = نصف)' : med.doseUnit === 'ml' ? 'مل' : med.doseUnit === 'drop' ? 'قطرات' : 'وحدات'}`}>
          <input className={inputCls} type="number" step="0.5" min={0.1} value={doseSize} onChange={(e) => setDoseSize(e.target.value)} />
        </Field>
        <Field label="أيام الأسبوع" hint="اتركه فارغاً = يومياً">
          <div className="flex gap-1 flex-wrap">
            {DAYS.map((d, i) => (
              <button
                key={d}
                className={`px-2 py-1 rounded-lg text-xs ${days?.includes(i) ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-600'}`}
                onClick={() => {
                  const cur = days ?? [0, 1, 2, 3, 4, 5, 6];
                  const next = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i];
                  setDays(next.length === 7 ? undefined : next);
                }}
              >
                {d}
              </button>
            ))}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> الجدول نشط
        </label>
        <div className="flex gap-2">
          <Button full onClick={() => void save()}>حفظ</Button>
          {schedules[0] && <Button variant="danger" onClick={() => void deleteSchedule()}>حذف</Button>}
        </div>
      </div>
    </Modal>
  );
}
