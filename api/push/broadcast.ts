// POST /api/push/broadcast — يرسل إشعاراً لبقية أجهزة العائلة عبر FCM (نمط req/res).
// الرسائل: dose_taken / dose_missed / stock_urgent / stock_low.
// الصوت فقط للعاجل (نفاد دواء هام) — باقي الإشعارات صامتة.

import { ensureSchema, getSql, audit } from '../_lib/db';
import { requireAuth, httpError } from '../_lib/auth';
import { handler, json, readJson, type VReq, type VRes } from '../_lib/http';
import { fcmConfigured, sendPush } from '../_lib/fcm';

interface Body {
  kind: 'dose_taken' | 'dose_missed' | 'stock_urgent' | 'stock_low';
  payload: Record<string, unknown>;
  deviceId?: string; // جهاز المرسل — يُستثنى من الاستقبال
}

const TITLES: Record<Body['kind'], string> = {
  dose_taken: 'تم أخذ جرعة',
  dose_missed: 'جرعة فائتة',
  stock_urgent: 'نفاد وشيك لدواء هام',
  stock_low: 'مخزون دواء ينخفض',
};

export default handler(async (req: VReq, res: VRes) => {
  if (req.method !== 'POST') throw httpError(405, 'طريقة غير مدعومة.');
  await ensureSchema();
  const ctx = await requireAuth(req);
  const body = await readJson<Body>(req);
  if (!TITLES[body.kind]) throw httpError(400, 'نوع إشعار غير معروف.');

  const q = getSql();
  const devices = await q`SELECT id, push_token FROM devices
                          WHERE family_id = ${ctx.familyId} AND push_token IS NOT NULL AND push_token <> ''`;
  let sent = 0;
  const urgent = body.kind === 'stock_urgent';
  const title = TITLES[body.kind];
  const med = String(body.payload?.medName ?? '');
  const p = body.payload?.personName ? `${body.payload.personName}: ` : '';
  const bodyText =
    body.kind === 'dose_taken' ? `${p}أُخذت جرعة ${med}`
    : body.kind === 'dose_missed' ? `${p}فاتت جرعة ${med}`
    : body.kind === 'stock_urgent' ? `${med}: باقي ~${body.payload?.daysRemaining ?? 0} يوم — نفاد وشيك لدواء هام`
    : `${med}: باقي ~${body.payload?.daysRemaining ?? 0} يوم`;

  for (const d of devices as { id: string; push_token: string }[]) {
    if (body.deviceId && d.id === body.deviceId) continue;
    const ok = await sendPush({
      token: d.push_token,
      title,
      body: bodyText,
      urgent,
      data: { kind: body.kind, ...bodyToData(body.payload) },
    });
    if (ok) sent++;
  }
  await audit(ctx.familyId, ctx.userId, `broadcast:${body.kind}`, 'push', `${sent}/${devices.length}`);
  json(req, res, 200, { sent, total: devices.length, fcm: fcmConfigured() });
});

function bodyToData(payload: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) out[k] = String(v ?? '');
  return out;
}
