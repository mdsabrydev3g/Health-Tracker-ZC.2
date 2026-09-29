import { describe, it, expect } from 'vitest';
import {
  policyFor, plannedDoseAlarms, stockAlertsToFire, receivingPolicy,
  type StockNotifyState,
} from '@/core/notify/policy';
import { DEFAULT_MOTHER_POLICY, DEFAULT_OWNER_POLICY } from '@/core/schema/types';

const NOW = 1_759_000_000_000; // ثابت

describe('policyFor', () => {
  it('وضع الوالدة: منبّه لكل جرعة', () => {
    const p = policyFor('mother');
    expect(p.alarmPerDose).toBe(true);
    expect(DEFAULT_MOTHER_POLICY.alarmPerDose).toBe(true);
  });
  it('وضع المالك: بلا منبّه جرعات', () => {
    const p = policyFor('owner');
    expect(p.alarmPerDose).toBe(false);
    expect(DEFAULT_OWNER_POLICY.urgentAlarmForImportantOnly).toBe(true);
  });
  it('عتبات متدرجة قابلة للتعديل', () => {
    const p = policyFor('owner', { lowStockThresholdDays: [14, 5, 2] });
    expect(p.lowStockThresholdDays).toEqual([14, 5, 2]);
  });
});

describe('plannedDoseAlarms', () => {
  const doses = [
    { medId: 'm1', scheduleId: 's1', plannedFor: NOW + 3600_000, medName: 'دواء أ', doseSize: 1, doseUnit: 'tablet' },
    { medId: 'm1', scheduleId: 's2', plannedFor: NOW - 3600_000, medName: 'دواء أ', doseSize: 1, doseUnit: 'tablet' }, // ماضية
    { medId: 'm2', scheduleId: 's3', plannedFor: NOW + 25 * 3600_000, medName: 'دواء ب', doseSize: 0.5, doseUnit: 'tablet' }, // خارج النافذة
  ];

  it('الوالدة: منبّهات لكل جرعة قادمة فقط', () => {
    const p = policyFor('mother');
    const alarms = plannedDoseAlarms(doses, NOW, p);
    expect(alarms).toHaveLength(1);
    expect(alarms[0].sound).toBe(true);
    expect(alarms[0].id).toBe('dose:s1:' + (NOW + 3600_000));
  });

  it('المالك: لا منبّهات جرعات إطلاقاً', () => {
    expect(plannedDoseAlarms(doses, NOW, policyFor('owner'))).toHaveLength(0);
  });
});

describe('stockAlertsToFire — التنبيهات المتدرجة', () => {
  const base = {
    medId: 'm1', medName: 'دواء هام', isImportant: true,
    daysRemaining: 8 as number | null, depletionDayKey: '2026-10-07',
  };
  const state: StockNotifyState = {};

  it('لا تنبيه عند الأخضر', () => {
    const r = stockAlertsToFire([{ ...base, thresholdIndex: 0 }], NOW, policyFor('owner'), state);
    expect(r.alerts).toHaveLength(0);
  });

  it('تنبيه أول عند تخطي العتبة الأولى (7 أيام) — صامت للمالك', () => {
    const r = stockAlertsToFire([{ ...base, thresholdIndex: 1, daysRemaining: 6 }], NOW, policyFor('owner'), state);
    expect(r.alerts).toHaveLength(1);
    expect(r.alerts[0].level).toBe(1);
    expect(r.alerts[0].alarm).toBe(false);
    expect(r.alerts[0].urgent).toBe(false);
    expect(r.newState['m1'].level).toBe(1);
  });

  it('لا تكرار خلال فترة التذكير — ثم تصاعد ينبّه', () => {
    const st: StockNotifyState = { m1: { level: 1, at: NOW - 3600_000 } };
    const noRepeat = stockAlertsToFire([{ ...base, thresholdIndex: 1, daysRemaining: 5 }], NOW, policyFor('owner'), st);
    expect(noRepeat.alerts).toHaveLength(0);
    const escalated = stockAlertsToFire([{ ...base, thresholdIndex: 2, daysRemaining: 2 }], NOW, policyFor('owner'), st);
    expect(escalated.alerts).toHaveLength(1);
    expect(escalated.alerts[0].level).toBe(2);
  });

  it('الدواء الهام عند الحرج: عاجل ومنبّه حتى لوضع المالك', () => {
    const st: StockNotifyState = { m1: { level: 2, at: NOW } };
    const r = stockAlertsToFire([{ ...base, thresholdIndex: 3, daysRemaining: 1 }], NOW, policyFor('owner'), st);
    expect(r.alerts[0].urgent).toBe(true);
    expect(r.alerts[0].alarm).toBe(true);
  });

  it('دواء غير هام عند الحرج: الوالدة تُنبَّه بصوت، المالك لا', () => {
    const st: StockNotifyState = { m1: { level: 2, at: NOW } };
    const r = stockAlertsToFire(
      [{ ...base, isImportant: false, thresholdIndex: 3, daysRemaining: 1 }],
      NOW, policyFor('owner'), st,
    );
    expect(r.alerts[0].urgent).toBe(false);
    expect(r.alerts[0].alarm).toBe(false);
    const r2 = stockAlertsToFire(
      [{ ...base, isImportant: false, thresholdIndex: 3, daysRemaining: 1 }],
      NOW, policyFor('mother'), { m1: { level: 2, at: NOW } },
    );
    expect(r2.alerts[0].alarm).toBe(true);
  });

  it('العودة للأخضر تصفر الحالة', () => {
    const r = stockAlertsToFire([{ ...base, thresholdIndex: 0 }], NOW, policyFor('owner'), { m1: { level: 3, at: NOW } });
    expect(r.newState['m1']).toBeUndefined();
  });

  it('notifyStock=false يوقف كل تنبيهات النفاد', () => {
    const p = policyFor('mother', { notifyStock: false });
    const r = stockAlertsToFire([{ ...base, thresholdIndex: 3, daysRemaining: 1 }], NOW, p, {});
    expect(r.alerts).toHaveLength(0);
  });
});

describe('receivingPolicy — إشعارات بين الأجهزة', () => {
  it('أخذ/فوات الجرعات تصل بصمت لجميع الأوضاع', () => {
    expect(receivingPolicy('dose_taken', 'owner', false)).toEqual({ display: true, sound: false });
    expect(receivingPolicy('dose_missed', 'mother', false)).toEqual({ display: true, sound: false });
  });
  it('نفاد دواء هام: عاجل وصوت للجميع', () => {
    expect(receivingPolicy('stock_urgent', 'owner', true)).toEqual({ display: true, sound: true });
  });
  it('نفاد عادي: صوت للوالدة فقط', () => {
    expect(receivingPolicy('stock_low', 'mother', false).sound).toBe(true);
    expect(receivingPolicy('stock_low', 'owner', false).sound).toBe(false);
  });
});
