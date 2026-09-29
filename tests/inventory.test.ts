import { describe, it, expect } from 'vitest';
import {
  computeBalance, foldBalance, projectStock, dosesRemaining, stockStatus,
  scheduledDailyUsage, prnAverageDailyUsage, progressRatio,
} from '@/core/engine/inventory';
import type { InventoryEvent, Med } from '@/core/schema/types';
import { addDaysToDayKey, diffDayKeys } from '@/core/time';

const TODAY = '2026-09-29';

function med(over: Partial<Med> = {}): Med {
  return {
    id: 'm1', familyId: 'f1', personId: 'p1', nameAr: 'دواء',
    form: 'tablet', doseUnit: 'tablet',
    isImportant: false, isChronic: false, prn: false,
    createdAt: 0, updatedAt: 0, ...over,
  };
}

function inv(deltas: number[]): InventoryEvent[] {
  return deltas.map((d, i) => ({
    id: `i${i}`, familyId: 'f1', medId: 'm1', delta: d,
    reason: d > 0 ? 'refill' : 'dose', at: i, createdAt: i,
  }));
}

describe('computeBalance', () => {
  it('مجموع الأحداث append-only', () => {
    expect(computeBalance(inv([60, -1, -1, -0.5]))).toBe(57.5);
    expect(computeBalance([])).toBe(0);
  });
});

describe('foldBalance — تفصيل العبوات', () => {
  it('علبة = شريطان × 10 أقراص', () => {
    const m = med({ presentation: { tabletsPerBlister: 10, blistersPerBox: 2 } });
    expect(foldBalance(42, m)).toMatchObject({ boxes: 2, blisters: 0, loose: 2 });
    expect(foldBalance(45, m).text).toContain('علبة');
    expect(foldBalance(25, m)).toMatchObject({ boxes: 1, blisters: 0, loose: 5 });
    // 20 قرصاً = علبة واحدة بالضبط
    expect(foldBalance(20, m)).toMatchObject({ boxes: 1, blisters: 0, loose: 0 });
  });

  it('شرائط مفردة', () => {
    const m = med({ presentation: { tabletsPerBlister: 10, blistersPerBox: 2 } });
    // 20+10+5 = 35 → علبة + شريط + 5
    expect(foldBalance(35, m)).toMatchObject({ boxes: 1, blisters: 1, loose: 5 });
  });

  it('سوائل: قوارير + مل', () => {
    const m = med({ doseUnit: 'ml', presentation: { mlPerBottle: 100 } });
    const f = foldBalance(250, m);
    expect(f).toMatchObject({ bottles: 2, remainingMl: 50 });
    expect(f.text).toContain('قارورة');
  });

  it('بلا تفصيل: نص وحدات فقط', () => {
    expect(foldBalance(12, med()).text).toBe('12 قرص');
  });
});

describe('scheduledDailyUsage', () => {
  it('مجموع (حجم × أوقات) لكل الجداول النشطة', () => {
    const s = (doseSize: number, times: string[], active = true) => ({
      id: `s${doseSize}${times[0]}`, familyId: 'f', personId: 'p', medId: 'm1',
      times, doseSize, startDate: 0, active, createdAt: 0, updatedAt: 0,
    });
    expect(scheduledDailyUsage('m1', [s(1, ['08:00', '20:00']), s(0.5, ['14:00'])])).toBe(2.5);
    expect(scheduledDailyUsage('m1', [s(1, ['08:00'], false)])).toBe(0);
  });
});

describe('prnAverageDailyUsage', () => {
  it('متوسط آخر 14 يوم فقط', () => {
    const evs = [
      { medId: 'm1', status: 'taken', amount: 1, dayKey: '2026-09-25' },
      { medId: 'm1', status: 'taken', amount: 1, dayKey: '2026-09-20' },
      { medId: 'm1', status: 'taken', amount: 5, dayKey: '2026-09-01' }, // خارج النافذة
      { medId: 'm2', status: 'taken', amount: 9, dayKey: '2026-09-25' }, // دواء آخر
    ];
    expect(prnAverageDailyUsage('m1', evs, TODAY, 14, diffDayKeys)).toBeCloseTo(2 / 14);
  });
});

describe('projectStock + dosesRemaining', () => {
  it('يحدد يوم النفاد', () => {
    const proj = projectStock(10, 2, TODAY, addDaysToDayKey);
    expect(proj).toHaveLength(5);
    expect(proj[proj.length - 1].balance).toBe(0);
    expect(proj[proj.length - 1].dayKey).toBe(addDaysToDayKey(TODAY, 4));
  });

  it('عدد الجرعات المتبقية مع أنصاف الأقراص', () => {
    expect(dosesRemaining(7.5, 1)).toBe(7);
    expect(dosesRemaining(7, 0.5)).toBe(14);
    expect(dosesRemaining(10, 0)).toBe(0);
  });
});

describe('stockStatus — العتبات المتدرجة 7/3/1', () => {
  const m = med();
  const st = (balance: number, perDay: number, thresholds = [7, 3, 1], isImportant = false) =>
    stockStatus(balance, med({ isImportant }), perDay, TODAY, thresholds, addDaysToDayKey, diffDayKeys);

  it('أخضر فوق 7 أيام', () => {
    expect(st(60, 2)).toMatchObject({ level: 'ok', thresholdIndex: 0 });
  });
  it('أصفر عند ≤7', () => {
    expect(st(13, 2)).toMatchObject({ level: 'low', thresholdIndex: 1 });
    // 18 قرصاً × جرعتين/يوم = 8 أيام متوقفة → أخضر
    expect(st(18, 2).level).toBe('ok');
  });
  it('برتقالي عند ≤3', () => {
    expect(st(6, 2)).toMatchObject({ level: 'warning', thresholdIndex: 2 });
  });
  it('أحمر عند ≤1', () => {
    expect(st(2, 2)).toMatchObject({ level: 'critical', thresholdIndex: 3 });
  });
  it('نفاد = حرج', () => {
    expect(st(0, 2)).toMatchObject({ level: 'critical', thresholdIndex: 3 });
  });
  it('الدواء الهام عند الحرج = عاجل', () => {
    expect(st(2, 2, [7, 3, 1], true).urgent).toBe(true);
    expect(st(2, 2, [7, 3, 1], false).urgent).toBe(false);
    expect(st(10, 2, [7, 3, 1], true).urgent).toBe(false);
  });
  it('عتبات مخصصة قابلة للتعديل', () => {
    expect(st(20, 2, [14, 7, 2]).level).toBe('low');
  });
  it('بلا استهلاك: لا تنبيه', () => {
    expect(st(30, 0)).toMatchObject({ level: 'ok' });
  });
});

describe('progressRatio', () => {
  it('مقيد بين 0 و1', () => {
    expect(progressRatio(100, 2)).toBe(1);
    expect(progressRatio(4, 2)).toBeLessThan(0.2);
    expect(progressRatio(0, 2)).toBe(0);
  });
});
