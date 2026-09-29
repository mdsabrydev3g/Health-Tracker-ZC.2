// api/_lib/http — مساعدات على النمط الكلاسيكي (req/res):
// حاضنة الدوال في Vercel هنا لا تُكمل استدعاءات نمط Request/Response
// (تعلّق بلا رؤوس) — النمط الكلاسيكي هو الوحيد الموثوق في هذا المشروع.

export interface VReq {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface VRes {
  setHeader(name: string, value: string): VRes;
  status(code: number): VRes;
  json(data: unknown): VRes;
  end(): VRes;
}

const ALLOWED_ORIGINS = new Set([
  'capacitor://localhost',
  'http://localhost',
  'http://localhost:5173',
  'http://localhost:4173',
  'tauri://localhost',
  'https://tauri.localhost',
]);

function applyCors(req: VReq, res: VRes): void {
  const origin = (req.headers.origin as string) ?? '';
  if (origin && (ALLOWED_ORIGINS.has(origin) || origin.endsWith('.vercel.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export function json(req: VReq, res: VRes, status: number, body: unknown): void {
  applyCors(req, res);
  res.status(status).json(body);
}

export function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

type Fn = (req: VReq, res: VRes) => Promise<void>;

/** غلاف موحد: OPTIONS، والتقاط الأخطاء كـ JSON عربي واضح */
export function handler(fn: Fn) {
  return async (req: VReq, res: VRes): Promise<void> => {
    try {
      if (req.method === 'OPTIONS') {
        applyCors(req, res);
        res.status(204).end();
        return;
      }
      await fn(req, res);
    } catch (e) {
      const err = e as Error & { status?: number };
      const status = err.status ?? 500;
      if (status === 500) console.error('[api]', err);
      json(req, res, status, { error: err.message || 'خطأ غير متوقع في السيرفر.' });
    }
  };
}

/** جسم الطلب JSON (Vercel يفكّه تلقائياً، مع احتياط نصي) */
export function readJson<T>(req: VReq): T {
  const b = req.body;
  if (b === undefined || b === null) throw httpError(400, 'طلب غير صالح (JSON).');
  if (typeof b === 'string') {
    try {
      return JSON.parse(b) as T;
    } catch {
      throw httpError(400, 'طلب غير صالح (JSON).');
    }
  }
  return b as T;
}

/** قراءة معامل مسار ديناميكي مثل [action] من req.query */
export function routeParam(req: VReq, name: string): string {
  const v = req.query?.[name];
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

/** يبني URL كاملاً من req لقراءة استعلامات البحث */
export function fullUrl(req: VReq): URL {
  const host = (req.headers['x-forwarded-host'] as string) ?? (req.headers.host as string) ?? 'localhost';
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  return new URL(req.url ?? '/', `${proto}://${host}`);
}
