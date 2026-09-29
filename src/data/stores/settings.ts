// stores/settings — إعدادات الجهاز: الوضع (والدة/مالك)، السياسة، العتبات،
// الذكاء الاصطناعي، الشخص النشط. تُخزَّن محلياً (Preferences/Dexie kv).

import { create } from 'zustand';
import type { DeviceMode, NotifyPolicy } from '@/core/schema/types';
import { policyFor } from '@/core/notify/policy';
import { kvGet, kvSet } from '@/data/dexie/db';

interface SettingsState {
  mode: DeviceMode;
  policy: NotifyPolicy;
  aiEnabled: boolean;
  tz: string;
  activePersonId: string;
  loaded: boolean;
  load: () => Promise<void>;
  setMode: (m: DeviceMode) => Promise<void>;
  setPolicy: (p: Partial<NotifyPolicy>) => Promise<void>;
  setAiEnabled: (v: boolean) => Promise<void>;
  setTz: (tz: string) => Promise<void>;
  setActivePerson: (id: string) => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  mode: 'owner',
  policy: policyFor('owner'),
  aiEnabled: true,
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo',
  activePersonId: '',
  loaded: false,
  load: async () => {
    const mode = (await kvGet<DeviceMode>('mode')) ?? 'owner';
    const saved = (await kvGet<Partial<NotifyPolicy>>('policy')) ?? {};
    const aiEnabled = (await kvGet<boolean>('aiEnabled')) ?? true;
    const tz = (await kvGet<string>('tz')) ?? get().tz;
    const activePersonId = (await kvGet<string>('activePersonId')) ?? '';
    set({
      mode,
      policy: policyFor(mode, saved),
      aiEnabled,
      tz,
      activePersonId,
      loaded: true,
    });
  },
  setMode: async (m) => {
    await kvSet('mode', m);
    const saved = (await kvGet<Partial<NotifyPolicy>>('policy')) ?? {};
    set({ mode: m, policy: policyFor(m, saved) });
  },
  setPolicy: async (p) => {
    const next = { ...get().policy, ...p };
    await kvSet('policy', next);
    set({ policy: next });
  },
  setAiEnabled: async (v) => {
    await kvSet('aiEnabled', v);
    set({ aiEnabled: v });
  },
  setTz: async (tz) => {
    await kvSet('tz', tz);
    set({ tz });
  },
  setActivePerson: async (id) => {
    await kvSet('activePersonId', id);
    set({ activePersonId: id });
  },
}));
