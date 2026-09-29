// stores/session — الجلسة والمصادقة: تسجيل دخول/إنشاء عائلة/انضمام،
// وتجديد التوكن تلقائياً. كل نداءات السيرفر تمر عبر apiFetch.

import { create } from 'zustand';
import type { SessionUser } from '@/core/schema/types';
import { kvGet, kvSet } from '@/data/dexie/db';

const API = '/api';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface SessionState {
  user: SessionUser | null;
  ready: boolean;
  tokens: Tokens | null;
  /** ضبط من Settings — عنوان بديل للسيرفر في بناء سطح المكتب */
  serverBase: string;
  init: () => Promise<void>;
  register: (args: { familyName: string; login: string; password: string; name: string }) => Promise<void>;
  join: (args: { inviteCode: string; login: string; password: string; name: string; role: 'mother' | 'member' }) => Promise<void>;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setServerBase: (base: string) => Promise<void>;
}

async function saveTokens(t: Tokens | null) {
  await kvSet('tokens', t);
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  ready: false,
  tokens: null,
  serverBase: '',
  init: async () => {
    const tokens = await kvGet<Tokens>('tokens');
    const serverBase = (await kvGet<string>('serverBase')) ?? '';
    set({ serverBase });
    if (!tokens) {
      set({ ready: true });
      return;
    }
    set({ tokens });
    try {
      const me = await apiFetch(get, '/auth/me');
      set({ user: me as SessionUser, ready: true });
    } catch {
      // توكن منتهٍ ولم يُجدَّد
      set({ tokens: null, user: null, ready: true });
      await saveTokens(null);
    }
  },
  register: async (args) => {
    const data = await apiFetch(get, '/auth/register', { method: 'POST', body: args, auth: false });
    const tokens = (data as { tokens: Tokens }).tokens;
    const user = (data as { user: SessionUser }).user;
    await saveTokens(tokens);
    set({ tokens, user });
  },
  join: async (args) => {
    const data = await apiFetch(get, '/auth/join', { method: 'POST', body: args, auth: false });
    const tokens = (data as { tokens: Tokens }).tokens;
    const user = (data as { user: SessionUser }).user;
    await saveTokens(tokens);
    set({ tokens, user });
  },
  login: async (login, password) => {
    const data = await apiFetch(get, '/auth/login', { method: 'POST', body: { login, password }, auth: false });
    const tokens = (data as { tokens: Tokens }).tokens;
    const user = (data as { user: SessionUser }).user;
    await saveTokens(tokens);
    set({ tokens, user });
  },
  logout: async () => {
    await saveTokens(null);
    set({ tokens: null, user: null });
  },
  setServerBase: async (base) => {
    await kvSet('serverBase', base);
    set({ serverBase: base });
  },
}));

interface FetchOpts {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

export async function apiFetch<T = unknown>(
  get: () => SessionState,
  path: string,
  opts: FetchOpts = {},
): Promise<T> {
  const { auth = true, method = 'GET', body } = opts;
  const base = get().serverBase || '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth && get().tokens) headers.Authorization = `Bearer ${get().tokens!.accessToken}`;

  let res: Response;
  try {
    res = await fetch(`${base}${API}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('تعذر الاتصال بالسيرفر — تحقق من الإنترنت أو من عنوان السيرفر في «المزيد».');
  }

  // تجديد التوكن مرة واحدة عند 401
  if (res.status === 401 && auth && get().tokens) {
    const rr = await fetch(`${base}${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: get().tokens!.refreshToken }),
    });
    if (rr.ok) {
      const data = (await rr.json()) as { tokens: Tokens };
      await saveTokens(data.tokens);
      useSession.setState({ tokens: data.tokens });
      headers.Authorization = `Bearer ${data.tokens.accessToken}`;
      res = await fetch(`${base}${API}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    }
  }

  if (!res.ok) {
    let msg = `خطأ ${res.status}`;
    if (res.status === 404 && path.startsWith('/auth')) {
      msg = 'لا يوجد سيرفر على هذا العنوان — راجع «المزيد ← عنوان السيرفر البديل» أو انشر التطبيق على Vercel.';
    }
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}
