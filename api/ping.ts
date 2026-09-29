// api/ping.ts — دالة تشخيص صفرية الاعتماديات: تميّز انهيار البيئة عن انهيار الكود.
export default async function handler(): Promise<Response> {
  return Response.json({ ok: true, pong: Date.now() });
}
