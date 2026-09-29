// api/ping.ts — اختبار نمط الدالة: الكلاسيكي (req/res) بدل Web-standard.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function handler(_req: any, res: any): void {
  res.status(200).json({ ok: true, style: 'req-res', pong: Date.now() });
}
