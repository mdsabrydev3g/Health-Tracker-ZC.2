// POST /api/auth/refresh — تدوير التوكنات

import { ensureSchema, getSql } from '../_lib/db';
import { signAccess, signRefresh, verifyToken } from '../_lib/auth';
import { handler, json, readJson, httpError } from '../_lib/http';

export default handler(async (req) => {
  if (req.method !== 'POST') throw httpError(405, 'طريقة غير مدعومة.');
  await ensureSchema();
  const { refreshToken } = await readJson<{ refreshToken: string }>(req);
  const payload = await verifyToken(refreshToken ?? '', 'refresh');
  if (!payload) throw httpError(401, 'انتهت صلاحية الجلسة — سجّل الدخول من جديد.');
  const q = getSql();
  const rows = await q`SELECT role FROM users WHERE id = ${payload.sub} AND family_id = ${payload.fam}`;
  if (!rows.length) throw httpError(401, 'الحساب غير موجود.');
  const role = String(rows[0].role);
  return json(req, 200, {
    tokens: {
      accessToken: await signAccess(payload.sub, payload.fam, role),
      refreshToken: await signRefresh(payload.sub, payload.fam),
    },
  });
});
