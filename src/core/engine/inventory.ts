// ============================================================
// core/engine/inventory — محرك المخزون: foldBalance / projectStock /
// dosesRemaining وتصنيف مستوى النفاد المتدرج. نقية بالكامل.
// الرصيد event-sourced: مجموع أحداث المخزون (تشمل خصم الجرعات).
// ============================================================

import type { InventoryEvent, Med, PackPresentation } from '../schema/types';

/** الجزء المستخدم من جدول الجرعات في حسابات المخزون (بلا اعتماد على المخطط الكامل) */
export interface ScheduleLite {
  medId: string;
  active: boolean;
  deletedAt?: number | null;
  times: string[];
  doseSize: number;
  daysOfWeek?: number[];
}

/** الرصيد بوحدات الدواء (أقراص/مل/وحدات) من أحداث المخزون append-only */
export function computeBalance(events: InventoryEvent[]): number {
  return events.reduce((sum, e) => sum + e.delta, 0);
}

export interface FoldedBalance {
  boxes: number;
  blisters: number;
  loose: number;
  bottles: number;
  remainingMl: number;
  text: string;
}

/**
 * يفصّل الرصيد إلى: علب (شرائط × أقراص بالشريط) + أقراص سائبة،
 * أو قوارير + مل متبقٍ للسوائل.
 */
export function foldBalance(units: number, med: Med): FoldedBalance {
  const p: PackPresentation = med.presentation ?? {};
  const u = Math.max(0, Math.round(units * 100) / 100);
  if (med.doseUnit === 'ml' || med.doseUnit === 'drop') {
    const perBottle = p.mlPerBottle ?? 0;
    if (perBottle > 0) {
      const bottles = Math.floor(u / perBottle);
      const remainingMl = Math.round((u - bottles * perBottle) * 100) / 100;
      return {
        boxes: bottles, blisters: 0, loose: 0,
        bottles, remainingMl,
        text: bottles > 0 ? `${bottles} قارورة + ${remainingMl} مل` : `${remainingMl} مل`,
      };
    }
    return { boxes: 0, blisters: 0, loose: u, bottles: 0, remainingMl: u, text: `${u} مل` };
  }
  const perBlister = p.tabletsPerBlister ?? 0;
  const perBox = perBlister * (p.blistersPerBox ?? 0);
  if (perBox > 0) {
    const boxes = Math.floor(u / perBox);
    const rem = u - boxes * perBox;
    const blisters = Math.floor(rem / perBlister);
    const loose = Math.round((rem - blisters * perBlister) * 100) / 100;
    const parts: string[] = [];
    if (boxes > 0) parts.push(`${boxes} علبة`);
    if (blisters > 0) parts.push(`${blisters} شريط`);
    if (loose > 0 || parts.length === 0) parts.push(`${loose} ${unitLabelAr(med)}`);
    return {
      boxes, blisters, loose, bottles: 0, remainingMl: 0,
      text: parts.join(' + '),
    };
  }
  return {
    boxes: 0, blisters: 0, loose: u, bottles: 0, remainingMl: 0,
    text: `${u} ${unitLabelAr(med)}`,
  };
}

export function unitLabelAr(med: Pick<Med, 'doseUnit'>): string {
  switch (med.doseUnit) {
    case 'tablet': return 'قرص';
    case 'ml': return 'مل';
    case 'unit': return 'وحدة';
    case 'drop': return 'قطرة';
    case 'puff': return 'نفثة';
    default: return 'وحدة';
  }
}

/** متوسط الاستهلاك اليومي المتوقع من الجداول النشطة (بوحدات/يوم) */
export function scheduledDailyUsage(medId: string, schedules: ScheduleLite[]): number {
  let perDay = 0;
  let daysConsidered = 0;
  for (const s of schedules) {
    if (s.medId !== medId || !s.active || s.deletedAt) continue;
    daysConsidered++;
    const weekly = s.daysOfWeek?.length ?? 7;
    perDay += s.doseSize * s.times.length * (weekly / 7);
  }
  return daysConsidered > 0 ? perDay : 0;
}

/** متوسط استخدام PRN الفعلي في آخر n يوم (من أحداث الجرعات)، باحتمال سقوط إلى 0 */
export function prnAverageDailyUsage(
  medId: string,
  doseEvents: { medId: string; status: string; amount: number; dayKey: string }[],
  todayKey: string,
  windowDays = 14,
  diffDayKeys: (a: string, b: string) => number,
): number {
  const cutoffDays = windowDays;
  let total = 0;
  let minDist = Infinity;
  for (const e of doseEvents) {
    if (e.medId !== medId || e.status !== 'taken') continue;
    const dist = Math.max(0, diffDayKeys(todayKey, e.dayKey));
    if (dist > cutoffDays) continue;
    total += e.amount;
    minDist = Math.min(minDist, dist);
  }
  if (!isFinite(minDist)) return 0;
  return Math.round((total / windowDays) * 100) / 100;
}

/** الاستهلاك اليومي المتوقع للدواء: جداول + PRN */
export function expectedDailyUsage(
  med: Med,
  schedules: ScheduleLite[],
  doseEvents: { medId: string; status: string; amount: number; dayKey: string }[],
  todayKey: string,
  diffDayKeysFn: (a: string, b: string) => number,
): number {
  const sched = scheduledDailyUsage(med.id, schedules);
  if (sched > 0) return sched;
  if (med.prn) {
    const avg = prnAverageDailyUsage(med.id, doseEvents, todayKey, 14, diffDayKeysFn);
    if (avg > 0) return avg;
    return Math.max(0, Math.min(med.prnMaxPerDay ?? 0, 1)) === 0
      ? (med.prnMaxPerDay ?? 0) > 0 ? 1 : 0
      : 0;
  }
  return 0;
}

export interface ProjectedDay {
  dayKey: string;
  balance: number;
}

/** يُسقط الرصيد يومياً حتى النفاد (حد أقصى افتراضي سنتان) */
export function projectStock(
  balance: number,
  perDay: number,
  fromDayKey: string,
  addDays: (k: string, n: number) => string,
  maxDays = 730,
): ProjectedDay[] {
  const out: ProjectedDay[] = [];
  let b = balance;
  let key = fromDayKey;
  for (let i = 0; i < maxDays && b > 0; i++) {
    b = Math.round((b - perDay) * 100) / 100;
    out.push({ dayKey: key, balance: Math.max(0, b) });
    key = addDays(key, 1);
  }
  return out;
}

/** عدد الجرعات المتبقية برصيد معين وحجم جرعة */
export function dosesRemaining(balance: number, doseSize: number): number {
  if (doseSize <= 0) return 0;
  return Math.floor(Math.round((balance / doseSize) * 100) / 100 + 1e-9);
}

export type StockLevel = 'ok' | 'low' | 'warning' | 'critical';

export interface StockStatus {
  level: StockLevel;
  /** 0=لا تنبيه، 1/2/3 = عتبة متخطاة (المتدرج) */
  thresholdIndex: 0 | 1 | 2 | 3;
  urgent: boolean;
  daysRemaining: number | null;
  depletionDayKey: string | null;
}

/**
 * مستوى المخزون مقابل العتبات المتدرجة [7,3,1]:
 * > 7 أخضر، ≤7 أصفر، ≤3 برتقالي، ≤1 أحمر.
 * الدواء الهام عند المستوى الحرج يصبح عاجلاً (ينبّه المالك بمنبّه).
 */
export function stockStatus(
  balance: number,
  med: Med,
  perDay: number,
  todayKey: string,
  thresholds: number[],
  addDaysFn: (k: string, n: number) => string,
  diffDayKeysFn: (a: string, b: string) => number,
): StockStatus {
  const th = thresholds.length >= 3 ? thresholds : [7, 3, 1];
  if (perDay <= 0 || balance <= 0) {
    const zero: StockLevel = balance <= 0 ? 'critical' : 'ok';
    return {
      level: zero,
      thresholdIndex: balance <= 0 ? 3 : 0,
      urgent: balance <= 0 && med.isImportant,
      daysRemaining: null,
      depletionDayKey: null,
    };
  }
  const proj = projectStock(balance, perDay, todayKey, addDaysFn);
  const depletion = proj.length ? proj[proj.length - 1].dayKey : null;
  const days = depletion ? diffDayKeysFn(depletion, todayKey) : null;
  let level: StockLevel = 'ok';
  let idx: 0 | 1 | 2 | 3 = 0;
  if (days !== null) {
    if (days <= th[2]) { level = 'critical'; idx = 3; }
    else if (days <= th[1]) { level = 'warning'; idx = 2; }
    else if (days <= th[0]) { level = 'low'; idx = 1; }
  }
  return {
    level,
    thresholdIndex: idx,
    urgent: level === 'critical' && med.isImportant,
    daysRemaining: days,
    depletionDayKey: depletion,
  };
}

export const STOCK_COLORS: Record<StockLevel, string> = {
  ok: 'green',
  low: 'yellow',
  warning: 'orange',
  critical: 'red',
};

/** لون شريط التقدم (نسبة الرصيد مقابل استهلاك 30 يوماً كمرجع بصري) */
export function progressRatio(balance: number, perDay: number, referenceDays = 30): number {
  if (perDay <= 0) return 1;
  const full = perDay * referenceDays;
  return Math.max(0, Math.min(1, balance / full));
}
