// ============================================================
// data/dexie/repos — كل كتابة في التطبيق تمر من هنا:
// تكتب محلياً في Dexie ثم تسجّل عملية في outbox للمزامنة.
// الجرعات والمخزون append-only، والحذف ناعم (soft delete) دائماً.
// ============================================================

import type {
  DoseEvent,
  EntityName,
  FoodLog,
  GtinEntry,
  InventoryEvent,
  InventoryReason,
  LabResult,
  Med,
  Person,
  Schedule,
  Symptom,
} from '@/core/schema/types';
import { enqueueOp } from '@/core/sync/outbox';
import { db, kvGet, kvSet } from './db';

export function newId(prefix = ''): string {
  const u = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return prefix ? `${prefix}_${u}` : u;
}

async function nextSeq(): Promise<number> {
  const cur = (await kvGet<number>('outboxSeq')) ?? 0;
  const next = cur + 1;
  await kvSet('outboxSeq', next);
  return next;
}

export async function enqueue(entity: EntityName, entityId: string, payload: unknown): Promise<void> {
  const seq = await nextSeq();
  const op = enqueueOp(await db.outbox.toArray(), {
    seq,
    entity,
    entityId,
    op: 'upsert',
    payload,
    at: Date.now(),
    tries: 0,
  });
  await db.outbox.clear();
  // enqueueOp قد يدمج العمليات — نعيد الكتابة كما أعادت المنطق النقي
  await db.outbox.bulkPut(op);
}

export async function outboxCount(): Promise<number> {
  return db.outbox.count();
}

// ---------- عمليات عامة: حفظ / حذف ناعم / استرجاع ----------

export type Writable = Person | Med | Schedule | LabResult | Symptom | FoodLog;

export async function upsert<T extends Writable>(entity: EntityName, obj: T): Promise<T> {
  const row = { ...obj, updatedAt: Date.now() } as T;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)[entity].put(row);
  await enqueue(entity, row.id, row);
  return row;
}

export async function softDelete(entity: EntityName, id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = (db as any)[entity];
  const row = await table.get(id);
  if (!row || row.deletedAt) return;
  const updated = { ...row, deletedAt: Date.now(), updatedAt: Date.now() };
  await table.put(updated);
  await enqueue(entity, id, updated);
}

export async function bulkSoftDelete(entity: EntityName, ids: string[]): Promise<void> {
  for (const id of ids) await softDelete(entity, id);
}

export async function restore(entity: EntityName, id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = (db as any)[entity];
  const row = await table.get(id);
  if (!row) return;
  const updated = { ...row, deletedAt: null, updatedAt: Date.now() };
  await table.put(updated);
  await enqueue(entity, id, updated);
}

/** حذف نهائي بعد انقضاء مدة السلة — لا يُستدعى تلقائياً إلا بعد 30 يوماً */
export async function purge(entity: EntityName, id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)[entity].delete(id);
}

// ---------- جرعات (append-only) ----------

export async function addDoseEvent(ev: DoseEvent): Promise<void> {
  await db.doseEvents.put(ev);
  await enqueue('doseEvents', ev.id, ev);
}

/** تأكيد جرعة: حدث جرعة + خصم تلقائي من المخزون (حدث مخزون) */
export async function takeDose(
  ev: DoseEvent,
  deduct: boolean,
): Promise<void> {
  await db.transaction('rw', db.doseEvents, db.inventoryEvents, db.outbox, async () => {
    await addDoseEvent(ev);
    if (deduct && ev.status === 'taken' && ev.amount > 0) {
      await addInventoryEvent({
        id: newId('inv'),
        familyId: ev.familyId,
        medId: ev.medId,
        delta: -ev.amount,
        reason: 'dose',
        at: ev.takenAt ?? Date.now(),
        note: 'خصم تلقائي عند تأكيد الجرعة',
        createdAt: Date.now(),
      });
    }
  });
}

// ---------- مخزون (append-only) ----------

export async function addInventoryEvent(ev: InventoryEvent): Promise<void> {
  await db.inventoryEvents.put(ev);
  await enqueue('inventoryEvents', ev.id, ev);
}

export async function refill(
  familyId: string,
  medId: string,
  delta: number,
  reason: InventoryReason,
  note?: string,
): Promise<void> {
  await addInventoryEvent({
    id: newId('inv'),
    familyId,
    medId,
    delta,
    reason,
    at: Date.now(),
    note,
    createdAt: Date.now(),
  });
}

// ---------- تعلّم الباركود ----------

export async function learnGtin(entry: GtinEntry): Promise<void> {
  await db.gtins.put(entry);
}

export async function findGtin(gtin: string): Promise<GtinEntry | undefined> {
  return db.gtins.get(gtin);
}

// ---------- حالة المزامنة ----------

export async function getSyncState<T>(key: string): Promise<T | undefined> {
  return kvGet<T>(`sync_${key}`);
}

export async function setSyncState(key: string, value: unknown): Promise<void> {
  await kvSet(`sync_${key}`, value);
}
