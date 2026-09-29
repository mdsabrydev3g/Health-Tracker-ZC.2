// GET /api/backup/get?id=... — جلب نسخة مشفرة (يفكها العميل بمفتاحه)

import { ensureSchema, getSql } from '../_lib/db';
import { requireAuth } from '../_lib/auth';
import { handler, json, httpError } from '../_lib/http';

export default handler(async (req) => {
  await ensureSchema();
  const ctx = await requireAuth(req);
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!id) throw httpError(400, 'id مطلوب.');
  const q = getSql();
  const rows = await q`SELECT cipher, created_at FROM backups
                       WHERE id = ${id} AND family_id = ${ctx.familyId}`;
  if (!rows.length) throw httpError(404, 'النسخة غير موجودة.');
  const r = rows[0] as { cipher: string; created_at: string };
  return json(req, 200, { cipher: r.cipher, createdAt: Number(r.created_at) });
});
