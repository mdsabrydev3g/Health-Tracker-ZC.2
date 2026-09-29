import { describe, it, expect } from 'vitest';
import { enqueueOp, shouldAcceptRemote, markFailed, markPushed, orderForPush, takeBatch, newOp } from '@/core/sync/outbox';
import type { SyncOp } from '@/core/schema/types';

function op(seq: number, entity: string, entityId: string, kind: 'upsert' | 'delete', payload: unknown = {}): SyncOp {
  return newOp(seq, entity as SyncOp['entity'], entityId, kind, payload, seq * 1000);
}

describe('enqueueOp', () => {
  it('upsert بعد upsert لنفس العنصر يستبدل الحمولة ويحفظ المركز', () => {
    const a = op(1, 'meds', 'x', 'upsert', { name: 'قديم' });
    const b = op(2, 'meds', 'x', 'upsert', { name: 'جديد' });
    const out = enqueueOp([a], b);
    expect(out).toHaveLength(1);
    expect(out[0].seq).toBe(1);
    expect((out[0].payload as { name: string }).name).toBe('جديد');
  });

  it('delete يبتلع السابق', () => {
    const a = op(1, 'meds', 'x', 'upsert');
    const b = op(2, 'meds', 'x', 'delete');
    const out = enqueueOp([a], b);
    expect(out).toHaveLength(1);
    expect(out[0].op).toBe('delete');
  });

  it('أحداث append-only لا تُدمج أبداً (كل جرعة مستقلة)', () => {
    const a = op(1, 'doseEvents', 'e1', 'upsert', { amount: 1 });
    const b = op(2, 'doseEvents', 'e1', 'upsert', { amount: 0.5 });
    const out = enqueueOp([a], b);
    expect(out).toHaveLength(2);
  });

  it('عناصر مختلفة تبقى مستقلة', () => {
    const out = enqueueOp([op(1, 'meds', 'x', 'upsert')], op(2, 'meds', 'y', 'upsert'));
    expect(out).toHaveLength(2);
  });
});

describe('shouldAcceptRemote — قرار الجلب', () => {
  it('append-only يقبل دائماً', () => {
    expect(shouldAcceptRemote('doseEvents', 'e1', 5, 10, [])).toBe(true);
  });

  it('عنصر له تعديل محلي معلق: المحلي يفوز', () => {
    const pending = [op(1, 'meds', 'x', 'upsert')];
    expect(shouldAcceptRemote('meds', 'x', 99, 5, pending)).toBe(false);
  });

  it('serverSeq أحدث يقبل، وأقدم يرفض', () => {
    expect(shouldAcceptRemote('meds', 'x', 11, 5, [])).toBe(true);
    expect(shouldAcceptRemote('meds', 'x', 3, 5, [])).toBe(false);
  });
});

describe('دفعات الدفع', () => {
  it('takeBatch يقسم', () => {
    const ops = [op(1, 'meds', 'a', 'upsert'), op(2, 'meds', 'b', 'upsert'), op(3, 'meds', 'c', 'upsert')];
    const { batch, rest } = takeBatch(ops, 2);
    expect(batch).toHaveLength(2);
    expect(rest).toHaveLength(1);
  });

  it('markPushed يحذف الناجح فقط', () => {
    const ops = [op(1, 'meds', 'a', 'upsert'), op(2, 'meds', 'b', 'upsert')];
    expect(markPushed(ops, [1])).toHaveLength(1);
  });

  it('markFailed يزيل بعد maxTries ويحفظ الخطأ', () => {
    let ops = [op(1, 'meds', 'a', 'upsert')];
    for (let i = 0; i < 8; i++) ops = markFailed(ops, ops, 'network', 1);
    expect(ops).toHaveLength(0);
  });

  it('orderForPush يفرز بالتسلسل', () => {
    const ops = [op(3, 'meds', 'c', 'upsert'), op(1, 'meds', 'a', 'upsert'), op(2, 'meds', 'b', 'upsert')];
    expect(orderForPush(ops).map((o) => o.seq)).toEqual([1, 2, 3]);
  });
});
