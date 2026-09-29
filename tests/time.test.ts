import { describe, it, expect } from 'vitest';
import { localDayKey, zonedTimeToEpoch, addDaysToDayKey, diffDayKeys, weekdayOfDayKey, formatTimeAr } from '@/core/time';

const TZ = 'Africa/Cairo';

describe('localDayKey', () => {
  it('يحسب المفتاح المحلي عبر منتصف الليل UTC', () => {
    // 2026-09-29T22:00Z = 2026-09-30 00:00 بالقاهرة (+2 شتاءً... سبتمبر = +3 DST حتى 2026-10-29 تقريباً)
    const d = new Date('2026-09-29T22:00:00Z');
    expect(localDayKey(d, TZ)).toBe('2026-09-30');
    expect(localDayKey(new Date('2026-09-29T20:00:00Z'), TZ)).toBe('2026-09-29');
  });
});

describe('zonedTimeToEpoch', () => {
  it('يحوّل 08:00 القاهرة في سبتمبر (UTC+3)', () => {
    const e = zonedTimeToEpoch('2026-09-29', '08:00', TZ);
    expect(new Date(e).toISOString()).toBe('2026-09-29T05:00:00.000Z');
  });
  it('مستقر بعد مرتين (تصحيح DST)', () => {
    const a = zonedTimeToEpoch('2026-07-15', '08:00', TZ);
    expect(new Date(a).toISOString()).toBe('2026-07-15T05:00:00.000Z');
  });
});

describe('dayKey helpers', () => {
  it('addDaysToDayKey و diffDayKeys', () => {
    expect(addDaysToDayKey('2026-09-29', 3)).toBe('2026-10-02');
    expect(addDaysToDayKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDayKeys('2026-10-06', '2026-09-29')).toBe(7);
    expect(diffDayKeys('2026-09-29', '2026-10-06')).toBe(-7);
  });
  it('weekdayOfDayKey: 2026-09-29 ثلاثاء=2', () => {
    expect(weekdayOfDayKey('2026-09-29', TZ)).toBe(2);
  });
});

describe('formatTimeAr', () => {
  it('صيغة 12 ساعة', () => {
    expect(formatTimeAr('08:05')).toBe('8:05 ص');
    expect(formatTimeAr('20:00')).toBe('8:00 م');
    expect(formatTimeAr('12:00')).toBe('12:00 م');
  });
});
