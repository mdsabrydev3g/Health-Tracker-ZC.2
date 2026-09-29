// POST /api/sync/push — يدفع عمليات outbox للعائلة.
// محمي بالمصادقة، وكل كتابة معزولة بـ family_id، مع audit log.
// الأحداث (جرعات/مخزون) append-only: تُدرج مرة واحدة بالمعرف.

import { ensureSchema, getSql, nextFamilySeq, audit, entityTable, UPDATABLE_ENTITIES, APPEND_ONLY_ENTITIES } from '../_lib/db';
import { requireAuth } from '../_lib/auth';
import { handler, json, readJson, httpError } from '../_lib/http';

interface Op {
  seq: number;
  entity: string;
  entityId: string;
  op: 'upsert' | 'delete';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  at: number;
}

export default handler(async (req) => {
  if (req.method !== 'POST') throw httpError(405, 'طريقة غير مدعومة.');
  await ensureSchema();
  const ctx = await requireAuth(req);
  const { ops } = await readJson<{ ops: Op[] }>(req);
  if (!Array.isArray(ops) || ops.length === 0 || ops.length > 200) {
    throw httpError(400, 'دفعة عمليات غير صالحة.');
  }
  const q = getSql();
  const results: { seq: number; serverSeq: number }[] = [];

  for (const op of ops) {
    const table = entityTable(op.entity);
    if (!table || !([...UPDATABLE_ENTITIES, ...APPEND_ONLY_ENTITIES] as string[]).includes(table)) {
      throw httpError(400, `كيان غير معروف: ${op.entity}`);
    }
    if (!op.entityId || typeof op.entityId !== 'string') {
      throw httpError(400, 'معرف عنصر غير صالح.');
    }
    const serverSeq = await nextFamilySeq(ctx.familyId);

    if (APPEND_ONLY_ENTITIES.includes(table as (typeof APPEND_ONLY_ENTITIES)[number])) {
      // append-only: تجاهل إن تكرر المعرّف (idempotent)
      await q(`INSERT INTO ${table} (id, family_id, server_seq, data, created_at)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (id) DO NOTHING`,
        [op.entityId, ctx.familyId, serverSeq, JSON.stringify(op.payload ?? {}), Number(op.at) || Date.now()]);
    } else if (op.op === 'delete') {
      // حذف ناعم على السيرفر أيضاً — التاريخ لا يُمسح
      await q(`UPDATE ${table} SET data = data || $3::jsonb, deleted_at = $2, updated_at = $2, server_seq = $4
               WHERE id = $1 AND family_id = $5`,
        [op.entityId, Date.now(), JSON.stringify({ deletedAt: Date.now() }), serverSeq, ctx.familyId]);
    } else {
      const deletedAt = Number(op.payload?.deletedAt ?? 0) || null;
      await q(`INSERT INTO ${table} (id, family_id, server_seq, data, updated_at, deleted_at)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (id) DO UPDATE
               SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at,
                   deleted_at = EXCLUDED.deleted_at, server_seq = EXCLUDED.server_seq`,
        [op.entityId, ctx.familyId, serverSeq, JSON.stringify(op.payload ?? {}), Date.now(), deletedAt]);
    }
    await audit(ctx.familyId, ctx.userId, op.op, op.entity, op.entityId);
    results.push({ seq: op.seq, serverSeq });
  }

  const last = await q`SELECT last_seq FROM families WHERE id = ${ctx.familyId}`;
  return json(req, 200, { results, lastSeq: Number(last[0]?.last_seq ?? 0) });
});
