// app/capNotify — محوّلات الإشعارات: Capacitor (أندرويد) والويب.

import { Capacitor } from '@capacitor/core';
import type { NotifyAdapter } from '@/data/notify/service';

/** محوّل أندرويد: إشعارات محلية مجدولة (Exact Alarms إن سمح النظام) */
export async function registerAlarmHealth(): Promise<NotifyAdapter> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  return {
    platform: 'android',
    ensurePermission: async () => {
      const cur = await LocalNotifications.checkPermissions();
      if (cur.display === 'prompt') {
        const res = await LocalNotifications.requestPermissions();
        return res.display === 'granted' ? 'granted' : 'denied';
      }
      return cur.display === 'granted' ? 'granted' : 'denied';
    },
    scheduleAlarms: async (alarms) => {
      const pending = await LocalNotifications.getPending();
      // نلغي كل المنبّهات القديمة (كلها تابعة لنا) ثم نجدول الحالية من جديد
      if (pending.notifications.length) {
        await LocalNotifications.cancel({
          notifications: pending.notifications.map((n) => ({ id: n.id })),
        });
      }
      if (!alarms.length) return;
      await LocalNotifications.schedule({
        notifications: alarms.map((a) => ({
          id: hashCode(a.id),
          title: a.title,
          body: a.body,
          schedule: { at: new Date(a.fireAt), allowWhileIdle: true },
          channelId: a.sound ? 'urgent' : 'general',
          sound: a.sound ? 'alarm.wav' : undefined,
          ongoing: false,
          actionTypeId: '',
          extra: { alarmId: a.id },
        })),
      });
    },
    notify: async (title, body, opts) => {
      await LocalNotifications.schedule({
        notifications: [{
          id: Date.now() % 2_000_000_000,
          title,
          body,
          channelId: opts?.urgent || opts?.sound ? 'urgent' : 'general',
        }],
      });
    },
  };
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}

/** محوّل الويب/سطح المكتب: Notification API + setTimeout للجلسة الحالية */
export async function registerWebNotify(): Promise<NotifyAdapter> {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  return {
    platform: isTauri ? 'desktop' : 'web',
    ensurePermission: async () => {
      if (typeof Notification === 'undefined') return 'denied';
      if (Notification.permission === 'default') return await Notification.requestPermission();
      return Notification.permission as 'granted' | 'denied' | 'default';
    },
    scheduleAlarms: async (alarms) => {
      // الويب: المؤقتات تعمل فقط والتطبيق مفتوح؛ الموثوقية الكاملة عبر Web Push
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
      if (isTauri) {
        // Tauri: إشعار النظام الأصلي عبر plugin، مع بديل ويب
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const t = window as any;
          await t.__TAURI_INTERNALS__?.invoke?.('plugin:notification|notify', {
            options: { title, body },
          });
          return;
        } catch { /* fallback */ }
      }
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(title, { body, tag: title, silent: !opts?.sound });
      }
    },
  };
}

export const isAndroid = (): boolean => Capacitor.getPlatform() === 'android';
