// features/today — صفحة اليوم: جرعات مخططة بأزرار (تم/تخطي/تأجيل)،
// خصم تلقائي من المخزون عند التأكيد، قسم PRN، وكشف الفائت.

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/dexie/db';
import { addDoseEvent, takeDose, newId, refill } from '@/data/dexie/repos';
import { useSettings } from '@/data/stores/settings';
import { useSession } from '@/data/stores/session';
import { useUi } from '@/data/stores/ui';
import { buildDayRows, materializeDay, type DoseRow } from '@/core/engine/doseEngine';
import { unitLabelAr } from '@/core/engine/inventory';
import { formatTimeAr, localDayKey } from '@/core/time';
import { broadcastEvent } from '@/data/notify/service';
import { Badge, Button, Card, Empty, Modal, SectionTitle, Field, inputCls } from '@/ui/components';

export function TodayPage() {
  const { tz, activePersonId, policy } = useSettings();
  const user = useSession((s) => s.user);
  const { undoable, toast } = useUi();
  const [now, setNow] = useState(Date.now());
  const [prnMedId, setPrnMed] = useState<string | null>(null);
  const [nextDayKey, setNextDayKey] = useState(() => localDayKey(new Date(), tz));

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const meds = useLiveQuery(() => db.meds.toArray(), []) ?? [];
  const schedules = useLiveQuery(() => db.schedules.toArray(), []) ?? [];
  const eventsToday = useLiveQuery(
    () => db.doseEvents.where('dayKey').equals(nextDayKey).toArray(),
    [nextDayKey],
  ) ?? [];

  const persons = useLiveQuery(() => db.persons.toArray(), []) ?? [];
  const personName = (id: string) => persons.find((p) => p.id === id)?.name ?? '';

  const visible = meds.filter((m) => !m.deletedAt && (!activePersonId || m.personId === activePersonId));
  const medIds = new Set(visible.map((m) => m.id));
  const mySchedules = schedules.filter((s) => medIds.has(s.medId));

  const planned = useMemo(
    () => materializeDay(mySchedules, visible, nextDayKey, tz),
    [mySchedules, visible, nextDayKey, tz],
  );
  const rows = useMemo(
    () => buildDayRows(planned, eventsToday, now, tz),
    [planned, eventsToday, now, tz],
  );

  const prnMeds = visible.filter((m) => m.prn);
  const missedCount = rows.filter((r) => r.state === 'late' || r.state === 'missed').length;
  const takenCount = rows.filter((r) => r.state === 'taken').length;

  const doTake = async (row: DoseRow, amountOverride?: number) => {
    if (!user) return;
    const ev = {
      id: newId('de'),
      familyId: row.planned.medId ? user.familyId : user.familyId,
      personId: row.planned.personId,
      medId: row.planned.medId,
      scheduleId: row.planned.scheduleId,
      plannedFor: row.planned.plannedFor,
      dayKey: nextDayKey,
      status: 'taken' as const,
      takenAt: Date.now(),
      amount: amountOverride ?? row.planned.doseSize,
      createdAt: Date.now(),
    };
    const med = visible.find((m) => m.id === row.planned.medId);
    await takeDose(ev, Boolean(med && !med.prn));
    void broadcastEvent('dose_taken', { medName: med?.nameAr, personName: personName(row.planned.personId) });
    toast(`سُجّلت جرعة ${med?.nameAr ?? ''} وخصمت من المخزون`);
  };

  const doSkip = async (row: DoseRow) => {
    if (!user) return;
    const ev = {
      id: newId('de'),
      familyId: user.familyId,
      personId: row.planned.personId,
      medId: row.planned.medId,
      scheduleId: row.planned.scheduleId,
      plannedFor: row.planned.plannedFor,
      dayKey: nextDayKey,
      status: 'skipped' as const,
      amount: 0,
      createdAt: Date.now(),
    };
    await addDoseEvent(ev);
    void broadcastEvent('dose_missed', { medName: visible.find((m) => m.id === row.planned.medId)?.nameAr });
    toast('سُجّل تخطي الجرعة');
  };

  const doLate = async (row: DoseRow) => {
    if (!user) return;
    const ev = {
      id: newId('de'),
      familyId: user.familyId,
      personId: row.planned.personId,
      medId: row.planned.medId,
      scheduleId: row.planned.scheduleId,
      plannedFor: row.planned.plannedFor,
      dayKey: nextDayKey,
      status: 'missed' as const,
      amount: 0,
      createdAt: Date.now(),
    };
    await addDoseEvent(ev);
    toast('سُجّلت الجرعة كفائتة');
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">
            {nextDayKey === localDayKey(new Date(), tz) ? 'جرعات اليوم' : 'جرعات يوم آخر'}
          </h1>
          <p className="text-sm text-gray-400">
            {takenCount} مأخوذة · {missedCount > 0 ? <span className="text-red-500">{missedCount} متأخرة</span> : 'لا متأخرات'}
          </p>
        </div>
        <Button variant="ghost" onClick={() => setNextDayKey(localDayKey(new Date(), tz))}>
          {nextDayKey === localDayKey(new Date(), tz) ? '' : 'العودة لليوم'}
        </Button>
      </div>

      {rows.length === 0 && prnMeds.length === 0 && (
        <Empty icon="☀️" title="لا جرعات مجدولة اليوم" hint="أضف دواءً وجدول جرعاته من قسم الأدوية" />
      )}

      <div className="space-y-2 mt-3">
        {rows.map((r) => (
          <DoseRowCard
            key={`${r.planned.scheduleId}_${r.planned.time}`}
            row={r}
            onTake={() => void doTake(r)}
            onHalf={() => void doTake(r, r.planned.doseSize / 2)}
            onSkip={() => void doSkip(r)}
            onLate={() => void doLate(r)}
          />
        ))}
      </div>

      {prnMeds.length > 0 && (
        <>
          <SectionTitle>أدوية عند اللزوم (PRN)</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {prnMeds.map((m) => (
              <Card key={m.id} className="p-3" onClick={() => setPrnMed(m.id)}>
                <div className="font-medium text-gray-800 text-sm">{m.nameAr}</div>
                <div className="text-xs text-gray-400">{m.strength} · عند اللزوم</div>
              </Card>
            ))}
          </div>
        </>
      )}

      <PrnTakeDialog
        medId={prnMedId}
        meds={prnMeds}
        onClose={() => setPrnMed(null)}
        onTake={async (med, amount, note) => {
          if (!user) return;
          await takeDose({
            id: newId('de'),
            familyId: user.familyId,
            personId: med.personId,
            medId: med.id,
            plannedFor: Date.now(),
            dayKey: localDayKey(new Date(), tz),
            status: 'taken',
            takenAt: Date.now(),
            amount,
            note,
            createdAt: Date.now(),
          }, true);
          setPrnMed(null);
          toast(`سُجّلت جرعة ${med.nameAr} (عند اللزوم)`);
        }}
      />

      {policy.mode === 'mother' && (
        <p className="text-xs text-gray-400 mt-6 text-center">
          المنبّه مفعّل لكل جرعة على هذا الجهاز 🔔
        </p>
      )}
    </div>
  );
}

function DoseRowCard({ row, onTake, onHalf, onSkip, onLate }: {
  row: DoseRow;
  onTake: () => void;
  onHalf: () => void;
  onSkip: () => void;
  onLate: () => void;
}) {
  const stateMap = {
    pending: { label: '', color: 'gray' as const },
    late: { label: 'متأخرة', color: 'red' as const },
    taken: { label: 'تمت ✓', color: 'green' as const },
    skipped: { label: 'مُخطاة', color: 'gray' as const },
    missed: { label: 'فائتة', color: 'red' as const },
  };
  const s = stateMap[row.state];
  return (
    <Card className={row.state === 'late' ? 'p-3 border-red-200' : 'p-3'}>
      <div className="flex items-center gap-3">
        <div className="text-center w-14 shrink-0">
          <div className="font-bold nums text-gray-700">{formatTimeAr(row.planned.time)}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-800 truncate">{row.planned.medName}</div>
          <div className="text-xs text-gray-400 nums">
            {row.planned.doseSize} {unitLabelAr({ doseUnit: row.planned.doseUnit })}
            {s.label && <Badge color={s.color}>{s.label}</Badge>}
          </div>
        </div>
        {row.state === 'pending' && (
          <div className="flex gap-1.5 shrink-0">
            <Button onClick={onTake} className="!px-3">تم</Button>
            {row.planned.doseUnit === 'tablet' && row.planned.doseSize % 1 === 0 && (
              <Button variant="soft" onClick={onHalf} className="!px-3">½</Button>
            )}
            <Button variant="ghost" onClick={onSkip} className="!px-3">تخطي</Button>
          </div>
        )}
        {row.state === 'late' && (
          <div className="flex gap-1.5 shrink-0">
            <Button onClick={onTake} className="!px-3">أخذتها الآن</Button>
            <Button variant="ghost" onClick={onLate} className="!px-3">سجّل فائتة</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

interface PrnMed {
  id: string;
  nameAr: string;
  doseUnit: string;
  strength?: string;
  prnMaxPerDay?: number;
  prnReasonHint?: string;
  personId: string;
}

function PrnTakeDialog({ medId, meds, onClose, onTake }: {
  medId: string | null;
  meds: PrnMed[];
  onClose: () => void;
  onTake: (med: PrnMed, amount: number, note?: string) => Promise<void>;
}) {
  const med = meds.find((m) => m.id === medId);
  const [amount, setAmount] = useState('1');
  const [note, setNote] = useState('');
  if (!med) return null;
  const isTablet = med.doseUnit === 'tablet';
  return (
    <Modal open title={`جرعة ${med.nameAr} (عند اللزوم)`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="الكمية" hint={isTablet ? 'مثال: 1 أو 0.5 لنصف قرص' : med.doseUnit === 'ml' ? 'بالمليلتر' : undefined}>
          <input className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="السبب (اختياري)" hint={med.prnReasonHint}>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {med.prnMaxPerDay ? <p className="text-xs text-gray-400">الحد اليومي: {med.prnMaxPerDay} جرعة</p> : null}
        <Button full onClick={() => void onTake(med, Number(amount) || 0, note || undefined)}>تأكيد وخصم من المخزون</Button>
      </div>
    </Modal>
  );
}
