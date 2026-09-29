// api/_lib/http — مساعدات الاستجابة وCORS وغلاف معالجة الأخطاء.

const ALLOWED_ORIGINS = new Set([
  'capacitor://localhost',
  'http://localhost',
  'http://localhost:5173',
  'http://localhost:4173',
  'tauri://localhost',
  'https://tauri.localhost',
]);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && (ALLOWED_ORIGINS.has(origin) || origin.endsWith('.vercel.app'))) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return headers;
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) },
  });
}

export function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

/** غلاف موحد: يلتقط الأخطاء ويعيدها JSON عربي واضح */
export function handler(fn: (req: Request, ctx: { params?: Record<string, string> }) => Promise<Response>) {
  return async (req: Request, ctx: { params?: Record<string, string> }): Promise<Response> => {
    try {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
      return await fn(req, ctx ?? {});
    } catch (e) {
      const err = e as Error & { status?: number };
      const status = err.status ?? 500;
      if (status === 500) console.error('[api]', err);
      return json(req, status, { error: err.message || 'خطأ غير متوقع في السيرفر.' });
    }
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw httpError(400, 'طلب غير صالح (JSON).');
  }
}
