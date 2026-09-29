// app/providers — تهيئة: الإعدادات، الجلسة، المزامنة، الإشعارات.
// يكتشف المنصة (Capacitor أندرويد / سطح مكتب / ويب) ويختار محوّل الإشعارات.

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useSession } from '@/data/stores/session';
import { useSettings } from '@/data/stores/settings';
import { startSyncLoop } from '@/data/sync/syncClient';
import {
  currentAdapter,
  refreshAlarmHealth,
  runNotificationCycle,
  setNotifyAdapter,
  type NotifyAdapter,
} from '@/data/notify/service';

async function webAdapter(): Promise<NotifyAdapter> {
  const isNative = Capacitor.isNativePlatform?.() ?? false;
  if (isNative && Capacitor.getPlatform() === 'android') {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const { registerAlarmHealth } = await import('./capNotify');
    await LocalNotifications.createChannel?.({ id: 'urgent', name: 'تنبيهات عاجلة', importance: 5, sound: 'alarm.wav', vibration: true }).catch(() => undefined);
    await LocalNotifications.createChannel?.({ id: 'general', name: 'إشعارات عامة', importance: 3 }).catch(() => undefined);
    return registerAlarmHealth();
  }
  const { registerWebNotify } = await import('./capNotify');
  return registerWebNotify();
}

export function useAppInit(): void {
  const ready = useSession((s) => s.ready);
  const user = useSession((s) => s.user);

  useEffect(() => {
    void (async () => {
      await useSettings.getState().load();
      await useSession.getState().init();
      setNotifyAdapter(await webAdapter());
      await refreshAlarmHealth();
      await runNotificationCycle();
      if (useSession.getState().user) startSyncLoop();
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    startSyncLoop();
    const t = setInterval(() => void runNotificationCycle().catch(() => undefined), 5 * 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void runNotificationCycle().catch(() => undefined); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [user]);

  return;
}
