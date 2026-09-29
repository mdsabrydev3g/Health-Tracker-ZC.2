// POST /api/push/register — تسجيل توكن جهاز لاستقبال الإشعارات (نمط req/res)

import { ensureSchema, getSql } from '../_lib/db';
import { requireAuth } from '../_lib/auth';
import { handler, json, readJson, httpError, type VReq, type VRes } from '../_lib/http';

interface Body {
  deviceId: string;
  platform: string;
  deviceName?: string;
  pushToken?: string;
  alarmHealth?: unknown;
}

export default handler(async (req: VReq, res: VRes) => {
  if (req.method !== 'POST') throw httpError(405, 'طريقة غير مدعومة.');
  await ensureSchema();
  const ctx = await requireAuth(req);
  const body = await readJson<Body>(req);
  if (!body.deviceId) throw httpError(400, 'deviceId مطلوب.');
  const q = getSql();
  await q`INSERT INTO devices (id, family_id, user_id, name, platform, push_token, alarm_health, updated_at)
          VALUES (${body.deviceId}, ${ctx.familyId}, ${ctx.userId}, ${body.deviceName ?? ''}, ${body.platform ?? 'web'},
                  ${body.pushToken ?? null}, ${JSON.stringify(body.alarmHealth ?? {})}::jsonb, ${Date.now()})
          ON CONFLICT (id) DO UPDATE
          SET push_token = EXCLUDED.push_token, platform = EXCLUDED.platform,
              name = EXCLUDED.name, alarm_health = EXCLUDED.alarm_health, updated_at = EXCLUDED.updated_at`;
  json(req, res, 200, { ok: true });
});
