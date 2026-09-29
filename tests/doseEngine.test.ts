import { describe, it, expect } from 'vitest';
import {
  materializeDay, detectMissed, buildDayRows, makeTakenEvent, doseEventKey,
} from '@/core/engine/doseEngine';
import type { Med, Schedule, DoseEvent } from '@/core/schema/types';
import { zonedTimeToEpoch } from '@/core/time';

const TZ = 'Africa/Cairo';
const DAY = '2026-09-29';

function med(over: Partial<Med> = {}): Med {
  return {
    id: 'm1', familyId: 'f1', personId: 'p1', nameAr: 'دواء تجريبي',
    form: 'tablet', doseUnit: 'tablet',
    isImportant: false, isChronic: true, prn: false,
    createdAt: 0, updatedAt: 0, ...over,
  };
}

function sched(over: Partial<Schedule> = {}): Schedule {
  return {
    id: 's1', familyId: 'f1', personId: 'p1', medId: 'm1',
    times: ['08:00', '20:00'], doseSize: 1,
    startDate: zonedTimeToEpoch(DAY, '00:00', TZ) - 86400_000,
    active: true, createdAt: 0, updatedAt: 0, ...over,
  };
}

describe('materializeDay', () => {
  it('ينتج جرعة لكل وقت مجدول', () => {
    const out = materializeDay([sched()], [med()], DAY, TZ);
    expect(out).toHaveLength(2);
    expect(out[0].time).toBe('08:00');
    expect(out[1].time).toBe('20:00');
  });

  it('يحترم أيام الأسبوع', () => {
    // 2026-09-29 ثلاثاء (الثلاثاء = 2)
    const out = materializeDay([sched({ daysOfWeek: [5, 6] })], [med()], DAY, TZ);
    expect(out).toHaveLength(0);
  });

  it('يتجاهل الجداول غير النشطة والدواء المحذوف', () => {
    expect(materializeDay([sched({ active: false })], [med()], DAY, TZ)).toHaveLength(0);
    expect(materializeDay([sched()], [med({ deletedAt: Date.now() })], DAY, TZ)).toHaveLength(0);
  });

  it('نصف قرص يمر بحجمه كما هو', () => {
    const out = materializeDay([sched({ doseSize: 0.5 })], [med()], DAY, TZ);
    expect(out[0].doseSize).toBe(0.5);
  });
});

describe('detectMissed', () => {
  it('يعتبر الجرعة فائتة بعد فترة السماح بلا حدث', () => {
    const planned = materializeDay([sched({ times: ['08:00'] })], [med()], DAY, TZ);
    const eightAm = zonedTimeToEpoch(DAY, '08:00', TZ);
    const late = eightAm + 31 * 60_000;
    expect(detectMissed(planned, [], late, TZ)).toHaveLength(1);
    // قبل السماح: ليست فائتة
    expect(detectMissed(planned, [], eightAm + 10 * 60_000, TZ)).toHaveLength(0);
  });

  it('لا يكرر الفائت إذا وُجد حدث (taken أو missed)', () => {
    const planned = materializeDay([sched({ times: ['08:00'] })], [med()], DAY, TZ);
    const ev: DoseEvent = {
      ...makeTakenEvent(planned[0], 'f1', Date.now(), TZ),
    };
    expect(detectMissed(planned, [ev], Date.now(), TZ)).toHaveLength(0);
  });
});

describe('buildDayRows', () => {
  it('يميز pending عن late', () => {
    const planned = materializeDay([sched({ times: ['08:00', '23:00'] })], [med()], DAY, TZ);
    const noon = zonedTimeToEpoch(DAY, '12:00', TZ);
    const rows = buildDayRows(planned, [], noon, TZ);
    expect(rows[0].state).toBe('late');
    expect(rows[1].state).toBe('pending');
  });
});

describe('makeTakenEvent', () => {
  it('يعطي معرفاً مستقراً يمنع التكرار', () => {
    const planned = materializeDay([sched({ times: ['08:00'] })], [med()], DAY, TZ);
    const a = makeTakenEvent(planned[0], 'f1', 1, TZ);
    const b = makeTakenEvent(planned[0], 'f1', 2, TZ);
    expect(a.id).toBe(b.id);
    expect(doseEventKey(a)).toBe(doseEventKey(b));
  });

  it('يسجل الكمية المخصومة (نصف قرص)', () => {
    const planned = materializeDay([sched({ times: ['08:00'], doseSize: 1 })], [med()], DAY, TZ);
    const ev = makeTakenEvent(planned[0], 'f1', 1, TZ, 0.5);
    expect(ev.amount).toBe(0.5);
  });
});
