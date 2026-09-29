// ============================================================
// core/notify/policy — سياسة الإشعارات والتنبيهات. نقية بالكامل.
//
// القاعدة الثابتة:
//  • وضع الوالدة (mother): منبّه كامل لكل جرعة + إشعارات + تنبيه نفاد لكل دواء.
//  • وضع المالك/الابن (owner): إشعارات فقط؛ المنبّه/التنبيه العاجل فقط
//    عند اقتراب نفاد دواء هام (isImportant).
//  • تنبيهات النفاد متدرجة (افتراضي 7/3/1 يوم) وقابلة للتعديل،
//    وكل مستوى يُنبَّه مرة واحدة فقط (dedup عبر stockNotifyState).
// ============================================================

import type {
  DeviceMode,
  Med,
  NotifyPolicy,
} from '../schema/types';
import { DEFAULT_MOTHER_POLICY, DEFAULT_OWNER_POLICY } from '../schema/types';

export function policyFor(mode: DeviceMode, overrides?: Partial<NotifyPolicy>): NotifyPolicy {
  const base = mode === 'mother' ? DEFAULT_MOTHER_POLICY : DEFAULT_OWNER_POLICY;
  return { ...base, ...overrides };
}

export interface PlannedAlarm {
  id: string; // فريد ومستقر لإعادة الجدولة
  kind: 'dose';
  medId: string;
  scheduleId: string;
  fireAt: number;
  title: string;
  body: string;
  sound: boolean;
}

/** منبّهات الجرعات القادمة داخل نافذة زمنية (لوضع الوالدة فقط) */
export function plannedDoseAlarms(
  doses: { medId: string; scheduleId: string; plannedFor: number; medName: string; doseSize: number; doseUnit: string }[],
  now: number,
  policy: NotifyPolicy,
  windowMs = 24 * 3600_000,
  unitLabel: (medId: string) => string = () => 'جرعة',
): PlannedAlarm[] {
  if (!policy.alarmPerDose) return [];
  return doses
    .filter((d) => d.plannedFor > now && d.plannedFor <= now + windowMs)
    .map((d) => ({
      id: `dose:${d.scheduleId}:${d.plannedFor}`,
      kind: 'dose' as const,
      medId: d.medId,
      scheduleId: d.scheduleId,
      fireAt: d.plannedFor,
      title: `وقت جرعة ${d.medName}`,
      body: `${d.doseSize} ${unitLabel(d.medId)}`,
      sound: true,
    }));
}

export interface StockNotifyState {
  /** آخر مستوى أُشعر به لكل دواء: 0=لا شيء، 1..3=عتبة */
  [medId: string]: { level: number; at: number };
}

export interface StockAlert {
  medId: string;
  medName: string;
  isImportant: boolean;
  level: 1 | 2 | 3;
  daysRemaining: number;
  depletionDayKey: string;
  /** إشعار عادي أم تنبيه عاجل بصوت/منبّه */
  urgent: boolean;
  /** هل يسمح الوضع بمنبّه صوتي لهذا التنبيه؟ */
  alarm: boolean;
  title: string;
  body: string;
}

/**
 * تنبيهات النفاد المتدرجة: يُطلق تنبيهاً فقط عند تصاعد المستوى،
 * ويُعاد التذكير بعد reminderIntervalMs (افتراضي 24 ساعة) دون تصاعد.
 */
export function stockAlertsToFire(
  statuses: {
    medId: string;
    medName: string;
    isImportant: boolean;
    thresholdIndex: 0 | 1 | 2 | 3;
    daysRemaining: number | null;
    depletionDayKey: string | null;
  }[],
  now: number,
  policy: NotifyPolicy,
  state: StockNotifyState,
  reminderIntervalMs = 24 * 3600_000,
): { alerts: StockAlert[]; newState: StockNotifyState } {
  const alerts: StockAlert[] = [];
  const newState: StockNotifyState = { ...state };
  if (!policy.notifyStock) return { alerts, newState };

  const labels = ['أسبوع', '3 أيام', 'يوم واحد'];
  for (const s of statuses) {
    const prev = state[s.medId];
    const prevLevel = prev?.level ?? 0;
    const withinReminder = prev ? now - prev.at < reminderIntervalMs : false;

    if (s.thresholdIndex === 0) {
      // عاد الوضع للأخضر — صفّر الحالة
      if (prevLevel > 0) delete newState[s.medId];
      continue;
    }
    const escalated = s.thresholdIndex > prevLevel;
    if (!escalated && withinReminder) continue;

    const idx = s.thresholdIndex as 1 | 2 | 3;
    const days = s.daysRemaining ?? 0;
    const th = policy.lowStockThresholdDays;
    const urgent = s.isImportant && s.thresholdIndex === 3;
    // وضع المالك: منبّه صوتي فقط للدواء الهام عند المستوى الحرج
    const alarm = policy.mode === 'mother' ? s.thresholdIndex >= 2 : urgent;
    alerts.push({
      medId: s.medId,
      medName: s.medName,
      isImportant: s.isImportant,
      level: idx,
      daysRemaining: days,
      depletionDayKey: s.depletionDayKey ?? '',
      urgent,
      alarm,
      title: s.thresholdIndex === 3 ? `نفاد وشيك: ${s.medName}` : `مخزون ${s.medName} ينخفض`,
      body:
        s.depletionDayKey
          ? `باقي ~${days} يوم — المتوقع ينتهي ${s.depletionDayKey}${urgent ? ' (هام!)' : ''}`
          : `المتبقي يكفي ${days} يوم تقريباً (حد التنبيه: ${th[idx - 1]} أيام)`,
    });
    newState[s.medId] = { level: s.thresholdIndex, at: now };
  }
  return { alerts, newState };
}

/** رسائل Push بين الأجهزة — يقرر المرسل ماذا يرسل حسب السياسة */
export type PushKind = 'dose_taken' | 'dose_missed' | 'stock_urgent' | 'stock_low';

export interface PushPayload {
  kind: PushKind;
  medName?: string;
  personName?: string;
  daysRemaining?: number;
  isImportant?: boolean;
}

/** هل تستقبل جهاز بهذا الوضع هذا النوع من الإشعارات؟ وبأي صوت؟ */
export function receivingPolicy(
  kind: PushKind,
  mode: DeviceMode,
  isImportant: boolean,
): { display: boolean; sound: boolean } {
  switch (kind) {
    case 'dose_taken':
    case 'dose_missed':
      // الطرف الآخر يهتم: المالك يتابع جرعات الوالدة، والعكس
      return { display: true, sound: false };
    case 'stock_urgent':
      // نفاد دواء هام: عاجل للجميع
      return { display: true, sound: true };
    case 'stock_low':
      // نفاد عادي: إشعار صامت للمالك، تنبيه للوالدة
      return { display: true, sound: mode === 'mother' };
    default:
      return { display: false, sound: false };
  }
}
