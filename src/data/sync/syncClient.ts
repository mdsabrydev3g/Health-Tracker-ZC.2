// sync/syncClient — حلقة المزامنة: يدفع outbox ثم يسحب التغييرات.
// كل الكيانات تتزامن (أدوية، جداول، جرعات، مخزون، تحاليل، أعراض، طعام، أفراد).
// الجرعات والمخزون append-only، والحذف ناعم عبر deletedAt.

import { db, kvGet, kvSet } from '@/data/dexie/db';
import { useSession, apiFetch } from '@/data/stores/session';
import { markFailed, markPushed, orderForPush, shouldAcceptRemote } from '@/core/sync/outbox';
import type { EntityName, SyncOp } from '@/core/schema/types';

const BATCH_SIZE = 50;
const INTERVAL_MS = 30_000;

let timer: ReturnType<typeof setInterval> | null = null;
let syncing = false;
let lastError = '';

export function syncStatus(): { syncing: boolean; lastError: string } {
  return { syncing, lastError };
}

export function startSyncLoop(): void {
  if (timer) return;
  timer = setInterval(() => void syncOnce().catch(() => undefined), INTERVAL_MS);
  window.addEventListener('online', () => void syncOnce().catch(() => undefined));
  void syncOnce().catch(() => undefined);
}

export async function syncOnce(): Promise<{ pushed: number; pulled: number }> {
  if (syncing) return { pushed: 0, pulled: 0 };
  const { tokens } = useSession.getState();
  if (!tokens) return { pushed: 0, pulled: 0 };
  syncing = true;
  try {
    const pushed = await pushOutbox();
    const pulled = await pullRemote();
    await kvSet('lastSyncAt', Date.now());
    return { pushed, pulled };
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    return { pushed: 0, pulled: 0 };
  } finally {
    syncing = false;
  }
}

async function pushOutbox(): Promise<number> {
  let total = 0;
  for (;;) {
    const ops = orderForPush(await db.outbox.toArray());
    if (ops.length === 0) break;
    const batch = ops.slice(0, BATCH_SIZE);
    try {
      const res = await apiFetch<{ results: { seq: number; serverSeq: number }[]; lastSeq: number }>(
        useSession.getState,
        '/sync/push',
        { method: 'POST', body: { ops: batch } },
      );
      const seqs = res.results.map((r) => r.seq);
      await db.outbox.bulkPut(markPushed(await db.outbox.toArray(), seqs));
      await db.outbox.bulkDelete(seqs);
      await kvSet('lastServerSeq', res.lastSeq);
      total += seqs.length;
      if (batch.length < BATCH_SIZE) break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const cur = await db.outbox.toArray();
      const failed = markFailed(cur, batch, msg, Date.now());
      await db.outbox.clear();
      await db.outbox.bulkPut(failed);
      throw e;
    }
  }
  return total;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function table(entity: EntityName): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (db as any)[entity];
}

async function pullRemote(): Promise<number> {
  const since = (await kvGet<number>('lastServerSeq')) ?? 0;
  let total = 0;
  let cursor = since;
  for (;;) {
    const res = await apiFetch<{
      changes: { entity: EntityName; row: Record<string, unknown> }[];
      lastSeq: number;
      hasMore: boolean;
    }>(useSession.getState, `/sync/pull?since=${cursor}`);
    const pendingOps: SyncOp[] = await db.outbox.toArray();
    for (const ch of res.changes) {
      const t = table(ch.entity);
      const row = ch.row as Record<string, unknown> & { id: string };
      const local = await t.get(row.id);
      const accept = shouldAcceptRemote(
        ch.entity,
        row.id,
        Number(row.serverSeq ?? 0),
        local?.serverSeq,
        pendingOps,
      );
      if (accept) {
        await t.put(row);
        total++;
      }
    }
    cursor = res.lastSeq;
    await kvSet('lastServerSeq', cursor);
    if (!res.hasMore) break;
  }
  return total;
}
