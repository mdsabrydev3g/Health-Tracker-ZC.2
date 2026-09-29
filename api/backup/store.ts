// POST /api/backup/store — يخزّن نسخة احتياطية مشفّرة (نص مشفّر فقط،
// السيرفر لا يستطيع فكها — التشفير من جهة العميل بمفتاح من كلمة مرور العائلة).

import { ensureSchema, getSql, audit } from '../_lib/db';
import { requireAuth } from '../_lib/auth';
import { handler, json, readJson, httpError } from '../_lib/http';
import { randomBytes } from 'node:crypto';

export default handler(async (req) => {
  if (req.method !== 'POST') throw httpError(405, 'طريقة غير مدعومة.');
  await ensureSchema();
  const ctx = await requireAuth(req);
  const { cipher } = await readJson<{ cipher: string }>(req);
  if (!cipher || cipher.length < 24) throw httpError(400, 'نسخة غير صالحة.');
  if (cipher.length > 12_000_000) throw httpError(413, 'النسخة كبيرة جداً.');

  const q = getSql();
  const rows = await q`SELECT id FROM backups WHERE family_id = ${ctx.familyId} ORDER BY created_at DESC`;
  const id = `bkp_${randomBytes(8).toString('hex')}`;
  await q`INSERT INTO backups (id, family_id, cipher, size, created_at)
          VALUES (${id}, ${ctx.familyId}, ${cipher}, ${cipher.length}, ${Date.now()})`;
  // احتفظ بآخر 10 نسخ فقط
  const extra = (rows as { id: string }[]).slice(9);
  for (const r of extra) {
    await q`DELETE FROM backups WHERE id = ${r.id} AND family_id = ${ctx.familyId}`;
  }
  await audit(ctx.familyId, ctx.userId, 'backup_store', 'backup', id);
  return json(req, 200, { id });
});
