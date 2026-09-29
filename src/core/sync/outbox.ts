// ============================================================
// core/sync/outbox — منطق outbox النقي: كل تعديل على أي كيان
// (أدوية، جداول، جرعات، مخزون، تحاليل، أعراض، طعام، أفراد)
// يُسجَّل كعملية ويتزامن. الحذف soft-delete، والأحداث append-only.
// ============================================================

import type { EntityName, SyncOp } from '../schema/types';
import { APPEND_ONLY } from '../schema/types';

export function newOp(
  seq: number,
  entity: EntityName,
  entityId: string,
  op: 'upsert' | 'delete',
  payload: unknown,
  at: number,
): SyncOp {
  return { seq, entity, entityId, op, payload, at, tries: 0 };
}

/**
 * دمج عملية جديدة مع outbox قائم لنفس الكيان/المعرّف:
 *  • upsert بعد upsert = استبدال الحمولة (آخر حالة تفوز) وتحديث الوقت.
 *  • delete يبتلع ما قبله.
 *  • append-only: كل عملية تُبقى كعملية مستقلة (لا تُدمج أبداً).
 * يعيد قائمة جديدة (نمط غير قابل للتغيير).
 */
export function enqueueOp(existing: SyncOp[], incoming: SyncOp): SyncOp[] {
  if (APPEND_ONLY.has(incoming.entity)) return [...existing, incoming];
  const out: SyncOp[] = [];
  let replaced = false;
  for (const op of existing) {
    if (op.entity === incoming.entity && op.entityId === incoming.entityId) {
      if (incoming.op === 'delete') {
        continue; // delete يبتلع أي عملية سابقة لنفس العنصر
      }
      if (!replaced) {
        out.push({ ...incoming, seq: op.seq }); // يحتفظ بمركز الدفعة الأقدم
        replaced = true;
        continue;
      }
      continue;
    }
    out.push(op);
  }
  if (!replaced) out.push(incoming);
  return out;
}

/** تقسيم دفعة Push مع زيادة عدد المحاولات للفاشلة */
export function takeBatch(ops: SyncOp[], size: number): { batch: SyncOp[]; rest: SyncOp[] } {
  return { batch: ops.slice(0, size), rest: ops.slice(size) };
}

export function markFailed(ops: SyncOp[], batch: SyncOp[], error: string, now: number, maxTries = 8): SyncOp[] {
  const failed = new Map(batch.map((b) => [b.seq, b]));
  return ops
    .map((op) => {
      const b = failed.get(op.seq);
      if (!b) return op;
      const tries = op.tries + 1;
      return tries >= maxTries ? undefined : { ...op, tries, lastError: `${error} @${now}` };
    })
    .filter((x): x is SyncOp => x !== undefined);
}

export function markPushed(ops: SyncOp[], pushedSeqs: number[]): SyncOp[] {
  const done = new Set(pushedSeqs);
  return ops.filter((op) => !done.has(op.seq));
}

/**
 * قرار الدمج عند الجلب من السيرفر:
 *  • يوجد op محلي معلّق لنفس العنصر → الحالة المحلية تفوز (سيُدفع لاحقاً).
 *  • append-only → يُقبل دائماً (حدث جديد).
 *  • غير ذلك → حالة السيرفر تفوز إذا كان serverSeq أحدث.
 */
export function shouldAcceptRemote(
  entity: EntityName,
  entityId: string,
  remoteServerSeq: number,
  localServerSeq: number | undefined,
  pendingOps: SyncOp[],
): boolean {
  if (APPEND_ONLY.has(entity)) return true;
  if (pendingOps.some((o) => o.entity === entity && o.entityId === entityId)) return false;
  return remoteServerSeq > (localServerSeq ?? 0);
}

/** فرز عمليات الدفع: الأقدم أولاً، والحذف يسبق التعديل لنفس العنصر */
export function orderForPush(ops: SyncOp[]): SyncOp[] {
  return [...ops].sort((a, b) => a.seq - b.seq);
}
