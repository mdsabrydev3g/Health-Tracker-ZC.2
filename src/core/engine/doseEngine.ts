// ============================================================
// core/engine/doseEngine — جدولة الجرعات وكشف الفائت. نقية بالكامل.
// ============================================================

import type { Med, Schedule, DoseEvent } from '../schema/types';
import { zonedTimeToEpoch, weekdayOfDayKey, localDayKey, localTimeHM } from '../time';

export interface PlannedDose {
  medId: string;
  scheduleId: string;
  personId: string;
  dayKey: string;
  time: string; // HH:mm
  plannedFor: number; // epoch ms
  doseSize: number;
  medName: string;
  doseUnit: Med['doseUnit'];
  isPrn?: boolean;
}

export function isScheduleActiveOnDay(s: Schedule, med: Med | undefined, dayKey: string, tz: string): boolean {
  if (!s.active || med?.deletedAt) return false;
  const wd = weekdayOfDayKey(dayKey, tz);
  if (s.daysOfWeek && !s.daysOfWeek.includes(wd)) return false;
  const startKey = localDayKey(new Date(s.startDate), tz);
  if (dayKey < startKey) return false;
  if (s.endDate) {
    const endKey = localDayKey(new Date(s.endDate), tz);
    if (dayKey > endKey) return false;
  }
  return true;
}

/** يحوّل الجداول النشطة إلى جرعات مخططة ليوم معيّن */
export function materializeDay(
  schedules: Schedule[],
  meds: Med[],
  dayKey: string,
  tz: string,
): PlannedDose[] {
  const medById = new Map(meds.map((m) => [m.id, m]));
  const out: PlannedDose[] = [];
  for (const s of schedules) {
    const med = medById.get(s.medId);
    if (!isScheduleActiveOnDay(s, med, dayKey, tz)) continue;
    for (const time of s.times) {
      out.push({
        medId: s.medId,
        scheduleId: s.id,
        personId: s.personId,
        dayKey,
        time,
        plannedFor: zonedTimeToEpoch(dayKey, time, tz),
        doseSize: s.doseSize,
        medName: med?.nameAr ?? '',
        doseUnit: med?.doseUnit ?? 'tablet',
      });
    }
  }
  out.sort((a, b) => a.plannedFor - b.plannedFor);
  return out;
}

/**
 * الجرعات الفائتة: مخططة ووقتها مضى بفترة سماح، ولا يوجد حدث لها.
 * يُطبَّق لكل (scheduleId, plannedFor) مرة واحدة.
 */
export function detectMissed(
  planned: PlannedDose[],
  events: DoseEvent[],
  now: number,
  tz: string,
  graceMinutes = 30,
): PlannedDose[] {
  const done = new Set(
    events
      .filter((e) => e.status !== 'skipped')
      .map((e) => `${e.scheduleId ?? ''}|${e.plannedFor}`),
  );
  const graceMs = graceMinutes * 60_000;
  return planned.filter(
    (p) =>
      !p.isPrn &&
      !done.has(`${p.scheduleId}|${p.plannedFor}`) &&
      zonedTimeToEpoch(p.dayKey, p.time, tz) + graceMs < now,
  );
}

/** حالة جرعة ليوم العرض: منتظرة / مؤخَّرة (فات موعدها ولم تُسجَّل) / مُسجَّلة */
export type DoseRowState = 'pending' | 'late' | 'taken' | 'skipped' | 'missed';

export interface DoseRow {
  planned: PlannedDose;
  state: DoseRowState;
  event?: DoseEvent;
}

export function buildDayRows(
  planned: PlannedDose[],
  events: DoseEvent[],
  now: number,
  tz: string,
  graceMinutes = 30,
): DoseRow[] {
  const byKey = new Map<string, DoseEvent>();
  for (const e of events) byKey.set(`${e.scheduleId ?? ''}|${e.plannedFor}`, e);
  return planned.map((p) => {
    const ev = byKey.get(`${p.scheduleId}|${p.plannedFor}`);
    if (ev) return { planned: p, state: ev.status, event: ev };
    const late = zonedTimeToEpoch(p.dayKey, p.time, tz) + graceMinutes * 60_000 < now;
    return { planned: p, state: late ? 'late' : 'pending' };
  });
}

/** يبني حدث جرعة (append-only) لأخذ جرعة الآن */
export function makeTakenEvent(
  p: PlannedDose,
  familyId: string,
  now: number,
  tz: string,
  amountOverride?: number,
  note?: string,
): DoseEvent {
  return {
    id: `de_${p.scheduleId}_${p.plannedFor}`,
    familyId,
    personId: p.personId,
    medId: p.medId,
    scheduleId: p.scheduleId,
    plannedFor: p.plannedFor,
    dayKey: localDayKey(new Date(now), tz),
    status: 'taken',
    takenAt: now,
    amount: amountOverride ?? p.doseSize,
    note,
    createdAt: now,
  };
}

/** مفتاح تفرّد حدث الجرعة — يمنع التكرار عند إعادة المحاولة */
export function doseEventKey(e: Pick<DoseEvent, 'scheduleId' | 'plannedFor'>): string {
  return `${e.scheduleId ?? ''}|${e.plannedFor}`;
}

/** الوقت المحلي التالي لجرعة من القائمة */
export function nextPlannedLabel(planned: PlannedDose[], now: number, tz: string): PlannedDose | undefined {
  return planned.find((p) => zonedTimeToEpoch(p.dayKey, p.time, tz) > now)
    ?? undefined;
}

export function nowHM(d: Date, tz: string): string {
  return localTimeHM(d, tz);
}
