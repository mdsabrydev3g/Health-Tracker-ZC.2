// ============================================================
// data/dexie/db — قاعدة IndexedDB المحلية (Dexie).
// المخطط هنا فقط؛ المنطق في core والمستودعات في repos.ts.
// ============================================================

import Dexie, { type Table } from 'dexie';
import type {
  AlarmHealth,
  DoseEvent,
  FoodLog,
  GtinEntry,
  InventoryEvent,
  LabResult,
  Med,
  Person,
  Schedule,
  Symptom,
  SyncOp,
} from '@/core/schema/types';

export interface KvRow {
  key: string;
  value: unknown;
}

export class HealthDb extends Dexie {
  persons!: Table<Person, string>;
  meds!: Table<Med, string>;
  schedules!: Table<Schedule, string>;
  doseEvents!: Table<DoseEvent, string>;
  inventoryEvents!: Table<InventoryEvent, string>;
  labResults!: Table<LabResult, string>;
  symptoms!: Table<Symptom, string>;
  foodLogs!: Table<FoodLog, string>;
  gtins!: Table<GtinEntry, string>;
  outbox!: Table<SyncOp, number>;
  kv!: Table<KvRow, string>;
  alarmHealth!: Table<AlarmHealth, string>;

  constructor() {
    super('health_tracker');
    this.version(1).stores({
      persons: 'id, familyId, updatedAt, deletedAt',
      meds: 'id, familyId, personId, gtin, barcode, updatedAt, deletedAt',
      schedules: 'id, familyId, personId, medId, updatedAt, deletedAt',
      doseEvents: 'id, familyId, personId, medId, scheduleId, plannedFor, dayKey, createdAt',
      inventoryEvents: 'id, familyId, medId, at, reason, createdAt',
      labResults: 'id, familyId, personId, kind, date, updatedAt, deletedAt',
      symptoms: 'id, familyId, personId, at, updatedAt, deletedAt',
      foodLogs: 'id, familyId, personId, at, updatedAt, deletedAt',
      gtins: 'gtin, confirmedAt',
      outbox: '++seq, entity, entityId, at',
      kv: 'key',
      alarmHealth: 'deviceId',
    });
  }
}

export const db = new HealthDb();

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await db.kv.get(key))?.value as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value });
}
