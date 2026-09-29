// notify/service — جدولة المنبّه والإشعارات على هذا الجهاز.
// يستخدم core/notify/policy (نقي) + محوّل حسب المنصة:
//  • Android (Capacitor): إشعارات محلية مجدولة (Exact Alarms) + فحص الأذونات.
//  • Web/سطح المكتب: Notification API + Service Worker (Push متاح عند الربط)،
//    ومهام setTimeout للجلسة الحالية فقط (التطبيق المغلق يحتاج Push — موثق).
// التطبيق يعيد الجدولة دورياً وبعد كل فتح (re-schedule) لتغطية إعادة التشغيل.

import type { Med, NotifyPolicy, Schedule } from '@/core/schema/types';
import {
  plannedDoseAlarms,
  stockAlertsToFire,
  type StockNotifyState,
} from '@/core/notify/policy';
import { computeBalance, expectedDailyUsage, stockStatus } from '@/core/engine/inventory';
import { materializeDay, detectMissed } from '@/core/engine/doseEngine';
import { addDaysToDayKey, diffDayKeys, localDayKey, zonedTimeToEpoch } from '@/core/time';
import { db, kvGet, kvSet } from '@/data/dexie/db';
import { useSettings } from '@/data/stores/settings';
import { apiFetch, useSession } from '@/data/stores/session';

export interface NotifyAdapter {
  platform: 'web' | 'android' | 'desktop';
  /** يضبط الإذن ويعيد الحالة */
  ensurePermission: () => Promise<'granted' | 'denied' | 'default'>;
  /** يجدول منبّهات بالساعة (ملغية السابقة لنفس المعرفات) */
  scheduleAlarms: (alarms: { id: string; fireAt: number; title: string; body: string; sound: boolean }[]) => Promise<void>;
  notify: (title: string, body: string, opts?: { sound?: boolean; urgent?: boolean }) => Promise<void>;
}

let adapter: NotifyAdapter | null = null;

export function setNotifyAdapter(a: NotifyAdapter): void {
  adapter = a;
}

function fallbackAdapter(): NotifyAdapter {
  return {
    platform: 'web',
    ensurePermission: async () => {
      if (typeof Notification === 'undefined') return 'denied';
      if (Notification.permission === 'default') return await Notification.requestPermission();
      return Notification.permission as 'granted' | 'denied' | 'default';
    },
    scheduleAlarms: async (alarms) => {
      // الويب: setTimeout يعمل فقط أثناء فتح التطبيق — الموثوقية الكاملة عبر Push
      for (const a of alarms) {
        const delay = a.fireAt - Date.now();
        if (delay > 0 && delay < 2 ** 31) {
          setTimeout(() => {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification(a.title, { body: a.body, tag: a.id });
            }
          }, delay);
        }
      }
    },
    notify: async (title, body, opts) => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(title, { body, tag: title, silent: !opts?.sound });
      }
    },
  };
}

export function currentAdapter(): NotifyAdapter {
  return adapter ?? fallbackAdapter();
}

export async function refreshAlarmHealth(): Promise<void> {
  const a = currentAdapter();
  const perm = await a.ensurePermission();
  const deviceId = (await kvGet<string>('deviceId')) ?? saveDeviceId();
  const prev = await db.alarmHealth.get(deviceId);
  await db.alarmHealth.put({
    deviceId,
    platform: a.platform,
    notificationsPermission: perm,
    exactAlarmPermission: prev?.exactAlarmPermission,
    batteryOptimized: prev?.batteryOptimized,
    lastScheduledAt: prev?.lastScheduledAt,
    lastAlarmFiredAt: prev?.lastAlarmFiredAt,
    pushToken: prev?.pushToken,
    updatedAt: Date.now(),
  });
}

function saveDeviceId(): string {
  const id = `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  void kvSet('deviceId', id);
  return id;
}

/** الجدولة الكاملة: منبّهات الجرعات + فحص الفائت + تنبيهات النفاد المتدرجة */
export async function runNotificationCycle(): Promise<void> {
  const { policy, tz, activePersonId } = useSettings.getState();
  const now = Date.now();
  const today = localDayKey(new Date(now), tz);
  const tomorrow = addDaysToDayKey(today, 1);

  const meds = (await db.meds.toArray()).filter((m) => !m.deletedAt);
  const schedules = (await db.schedules.toArray()).filter((s) => !s.deletedAt);
  const events = await db.doseEvents.toArray();

  const visible = (m: Med) => !activePersonId || m.personId === activePersonId;
  const myMeds = meds.filter(visible);
  const myMedIds = new Set(myMeds.map((m) => m.id));
  const mySchedules = schedules.filter((s) => myMedIds.has(s.medId));

  // 1) منبّهات الجرعات القادمة (وضع الوالدة)
  const planned = [
    ...materializeDay(mySchedules, myMeds, today, tz),
    ...materializeDay(mySchedules, myMeds, tomorrow, tz),
  ];
  const alarms = plannedDoseAlarms(planned, now, policy, 26 * 3600_000, (medId) => {
    const m = myMeds.find((x) => x.id === medId);
    return m ? `${m.doseUnit === 'ml' ? 'مل' : m.doseUnit === 'drop' ? 'قطرة' : 'جرعة'}` : 'جرعة';
  });
  const a = currentAdapter();
  await a.scheduleAlarms(alarms);

  const deviceId = (await kvGet<string>('deviceId')) ?? saveDeviceId();
  await db.alarmHealth.put({
    ...(await db.alarmHealth.get(deviceId)),
    deviceId,
    platform: a.platform,
    lastScheduledAt: now,
    updatedAt: now,
  });

  // 2) الفائت — إشعار فوري (بدون منبّه في وضع المالك)
  for (const d of detectMissed(planned.filter((p) => p.dayKey === today), events, now, tz)) {
    const key = `missed_${d.scheduleId}_${d.plannedFor}`;
    if (await kvGet<boolean>(key)) continue;
    await kvSet(key, true);
    await a.notify(`فاتت جرعة ${d.medName}`, `الموعد ${d.time} — لم تُسجَّل. سجّلها الآن أو تجاوزها.`, {
      sound: policy.mode === 'mother',
    });
  }

  // 3) تنبيهات النفاد المتدرجة
  const state = (await kvGet<StockNotifyState>('stockNotifyState')) ?? {};
  const computed: { m: Med; balance: number }[] = [];
  for (const m of myMeds) {
    const evs = await db.inventoryEvents.where('medId').equals(m.id).toArray();
    computed.push({ m, balance: computeBalance(evs) });
  }
  const stockStatuses = computed.map(({ m, balance }) => {
    const perDay = expectedDailyUsage(m, mySchedules, events, today, diffDayKeys);
    const st = stockStatus(balance, m, perDay, today, m.lowStockDays ?? policy.lowStockThresholdDays, addDaysToDayKey, diffDayKeys);
    return {
      medId: m.id,
      medName: m.nameAr,
      isImportant: m.isImportant,
      thresholdIndex: st.thresholdIndex,
      daysRemaining: st.daysRemaining,
      depletionDayKey: st.depletionDayKey,
    };
  });
  const { alerts, newState } = stockAlertsToFire(stockStatuses, now, policy, state);
  await kvSet('stockNotifyState', newState);
  for (const alert of alerts) {
    await a.notify(alert.title, alert.body, { sound: alert.alarm, urgent: alert.urgent });
  }
}

/** يُستدعى بعد أخذ/تفويت جرعة — يخبر الأجهزة الأخرى عبر السيرفر */
export async function broadcastEvent(
  kind: 'dose_taken' | 'dose_missed' | 'stock_urgent' | 'stock_low',
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const deviceId = (await kvGet<string>('deviceId')) ?? '';
    await apiFetch(useSession.getState, '/push/broadcast', {
      method: 'POST',
      body: { kind, payload, deviceId },
    });
  } catch {
    // بلا اتصال — سيغطيها المزامنة القادمة
  }
}

export type { NotifyPolicy, Schedule };
