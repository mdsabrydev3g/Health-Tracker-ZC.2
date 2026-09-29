// GET /api/health — فحص جاهزية السيرفر وقاعدة البيانات

import { ensureSchema, getSql } from './_lib/db';
import { handler, json } from './_lib/http';
import { fcmConfigured } from './_lib/fcm';
import { providersStatus } from './_lib/aiProviders';

export default handler(async (req) => {
  try {
    await ensureSchema();
    await getSql()`SELECT 1`;
    return json(req, 200, {
      ok: true,
      db: true,
      fcm: fcmConfigured(),
      ai: providersStatus().filter((p) => p.available).map((p) => p.id),
    });
  } catch (e) {
    return json(req, 200, { ok: false, error: (e as Error).message });
  }
});
