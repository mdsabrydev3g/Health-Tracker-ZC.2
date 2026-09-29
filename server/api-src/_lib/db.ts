// api/_lib/db — اتصال Neon + مخطط SQL (idempotent) + مساعدات استعلام.
// كل استعلام مرتبط دائماً بـ family_id لعزل بيانات العائلات.

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let sql: NeonQueryFunction<false, false> | null = null;
let schemaReady: Promise<void> | null = null;

export function getSql(): NeonQueryFunction<false, false> {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL غير مضبوط — اضبط متغيرات البيئة على السيرفر.');
    sql = neon(url);
  }
  return sql;
}

export function ensureSchema(): Promise<void> {
  if (!schemaReady) schemaReady = createSchema().catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}

async function createSchema(): Promise<void> {
  const q = getSql();
  await q`CREATE TABLE IF NOT EXISTS families (
    id text PRIMARY KEY,
    name text NOT NULL,
    tz text NOT NULL DEFAULT 'Africa/Cairo',
    invite_code text UNIQUE NOT NULL,
    last_seq bigint NOT NULL DEFAULT 0,
    ai_day text,
    ai_calls_today int NOT NULL DEFAULT 0,
    created_at bigint NOT NULL
  )`;
  await q`CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY,
    family_id text NOT NULL REFERENCES families(id),
    login text UNIQUE NOT NULL,
    pass_hash text NOT NULL,
    name text NOT NULL,
    role text NOT NULL,
    person_id text,
    created_at bigint NOT NULL
  )`;
  await q`CREATE TABLE IF NOT EXISTS devices (
    id text PRIMARY KEY,
    family_id text NOT NULL,
    user_id text NOT NULL,
    name text,
    platform text,
    push_token text,
    alarm_health jsonb,
    updated_at bigint NOT NULL
  )`;
  for (const t of ['meds', 'schedules', 'lab_results', 'symptoms', 'food_logs', 'persons']) {
    await q(`CREATE TABLE IF NOT EXISTS ${t} (
      id text PRIMARY KEY,
      family_id text NOT NULL,
      server_seq bigint NOT NULL DEFAULT 0,
      data jsonb NOT NULL,
      updated_at bigint NOT NULL,
      deleted_at bigint
    )`);
  }
  for (const t of ['dose_events', 'inventory_events']) {
    await q(`CREATE TABLE IF NOT EXISTS ${t} (
      id text PRIMARY KEY,
      family_id text NOT NULL,
      server_seq bigint NOT NULL DEFAULT 0,
      data jsonb NOT NULL,
      created_at bigint NOT NULL
    )`);
  }
  await q`CREATE TABLE IF NOT EXISTS audit_log (
    id bigserial PRIMARY KEY,
    family_id text NOT NULL,
    user_id text,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id text,
    at bigint NOT NULL
  )`;
  await q`CREATE TABLE IF NOT EXISTS backups (
    id text PRIMARY KEY,
    family_id text NOT NULL,
    cipher text NOT NULL,
    size int NOT NULL,
    created_at bigint NOT NULL
  )`;
  await q`CREATE INDEX IF NOT EXISTS meds_fseq ON meds (family_id, server_seq)`;
  await q`CREATE INDEX IF NOT EXISTS sched_fseq ON schedules (family_id, server_seq)`;
  await q`CREATE INDEX IF NOT EXISTS labs_fseq ON lab_results (family_id, server_seq)`;
  await q`CREATE INDEX IF NOT EXISTS symptoms_fseq ON symptoms (family_id, server_seq)`;
  await q`CREATE INDEX IF NOT EXISTS food_fseq ON food_logs (family_id, server_seq)`;
  await q`CREATE INDEX IF NOT EXISTS persons_fseq ON persons (family_id, server_seq)`;
  await q`CREATE INDEX IF NOT EXISTS dose_fseq ON dose_events (family_id, server_seq)`;
  await q`CREATE INDEX IF NOT EXISTS inv_fseq ON inventory_events (family_id, server_seq)`;
}

export const UPDATABLE_ENTITIES = ['meds', 'schedules', 'lab_results', 'symptoms', 'food_logs', 'persons'] as const;
export const APPEND_ONLY_ENTITIES = ['dose_events', 'inventory_events'] as const;
export type UpdatableEntity = (typeof UPDATABLE_ENTITIES)[number];

export function entityTable(entity: string): string | null {
  const map: Record<string, string> = {
    meds: 'meds',
    schedules: 'schedules',
    labResults: 'lab_results',
    symptoms: 'symptoms',
    foodLogs: 'food_logs',
    persons: 'persons',
    doseEvents: 'dose_events',
    inventoryEvents: 'inventory_events',
  };
  return map[entity] ?? null;
}

/** يخصص رقماً تسلسلياً للعائلة (مؤشر سحب رتيب) */
export async function nextFamilySeq(familyId: string): Promise<number> {
  const q = getSql();
  const rows = await q`UPDATE families SET last_seq = last_seq + 1 WHERE id = ${familyId} RETURNING last_seq`;
  return Number(rows[0].last_seq);
}

export async function audit(familyId: string, userId: string | null, action: string, entity: string, entityId: string | null): Promise<void> {
  const q = getSql();
  await q`INSERT INTO audit_log (family_id, user_id, action, entity, entity_id, at)
          VALUES (${familyId}, ${userId}, ${action}, ${entity}, ${entityId}, ${Date.now()})`;
}
