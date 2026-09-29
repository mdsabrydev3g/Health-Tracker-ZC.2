// server/pinglib.ts — مكتبة مشتركة خارج api/ (اختبار تضمين الاستيرادات)
export function pongPayload(): { ok: boolean; src: string; at: number } {
  return { ok: true, src: 'selfcheck2: shared import outside api/ OK', at: Date.now() };
}
