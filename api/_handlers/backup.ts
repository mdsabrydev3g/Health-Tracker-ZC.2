// api/_handlers/backup — النسخ الاحتياطية المشفرة (يستدعيه backup/[action].ts).
// السيرفر يخزّن نصاً مشفّراً فقط — التشفير من جهة العميل (AES-256-GCM).

import { randomBytes } from 'node:crypto';
import { ensureSchema, getSql, audit } from '../_lib/db';
import { requireAuth } from '../_lib/auth';
import { json, readJson, httpError, fullUrl, type VReq, type VRes } from '../_lib/http';

/** POST /api/backup/store */
export async function handleStore(req: VReq, res: VRes): Promise<void> {
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
  json(req, res, 200, { id });
}

/** GET /api/backup/list */
export async function handleList(req: VReq, res: VRes): Promise<void> {
  await ensureSchema();
  const ctx = await requireAuth(req);
  const q = getSql();
  const rows = await q`SELECT id, size, created_at FROM backups
                       WHERE family_id = ${ctx.familyId} ORDER BY created_at DESC LIMIT 10`;
  json(req, res, 200, {
    backups: (rows as { id: string; size: number; created_at: string }[]).map((r) => ({
      id: r.id, size: Number(r.size), createdAt: Number(r.created_at),
    })),
  });
}

/** GET /api/backup/get?id=... */
export async function handleGet(req: VReq, res: VRes): Promise<void> {
  await ensureSchema();
  const ctx = await requireAuth(req);
  const id = fullUrl(req).searchParams.get('id') ?? '';
  if (!id) throw httpError(400, 'id مطلوب.');
  const q = getSql();
  const rows = await q`SELECT cipher, created_at FROM backups
                       WHERE id = ${id} AND family_id = ${ctx.familyId}`;
  if (!rows.length) throw httpError(404, 'النسخة غير موجودة.');
  const r = rows[0] as { cipher: string; created_at: string };
  json(req, res, 200, { cipher: r.cipher, createdAt: Number(r.created_at) });
}
