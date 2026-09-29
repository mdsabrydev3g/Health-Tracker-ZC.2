"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server/api-src/backup/[action].ts
var action_exports = {};
__export(action_exports, {
  default: () => action_default
});
module.exports = __toCommonJS(action_exports);

// server/api-src/_lib/http.ts
var ALLOWED_ORIGINS = /* @__PURE__ */ new Set([
  "capacitor://localhost",
  "http://localhost",
  "http://localhost:5173",
  "http://localhost:4173",
  "tauri://localhost",
  "https://tauri.localhost"
]);
function applyCors(req, res) {
  const origin = req.headers.origin ?? "";
  if (origin && (ALLOWED_ORIGINS.has(origin) || origin.endsWith(".vercel.app"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}
function json(req, res, status, body) {
  applyCors(req, res);
  res.status(status).json(body);
}
function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
function handler(fn) {
  return async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        applyCors(req, res);
        res.status(204).end();
        return;
      }
      await fn(req, res);
    } catch (e) {
      const err = e;
      const status = err.status ?? 500;
      if (status === 500) console.error("[api]", err);
      json(req, res, status, { error: err.message || "\u062E\u0637\u0623 \u063A\u064A\u0631 \u0645\u062A\u0648\u0642\u0639 \u0641\u064A \u0627\u0644\u0633\u064A\u0631\u0641\u0631." });
    }
  };
}
function readJson(req) {
  const b = req.body;
  if (b === void 0 || b === null) throw httpError(400, "\u0637\u0644\u0628 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D (JSON).");
  if (typeof b === "string") {
    try {
      return JSON.parse(b);
    } catch {
      throw httpError(400, "\u0637\u0644\u0628 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D (JSON).");
    }
  }
  return b;
}
function routeParam(req, name) {
  const v = req.query?.[name];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}
function fullUrl(req) {
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
  const proto = req.headers["x-forwarded-proto"] ?? "https";
  return new URL(req.url ?? "/", `${proto}://${host}`);
}

// server/api-src/_handlers/backup.ts
var import_node_crypto = require("node:crypto");

// server/api-src/_lib/db.ts
var import_serverless = require("@neondatabase/serverless");
var sql = null;
var schemaReady = null;
function getSql() {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637 \u2014 \u0627\u0636\u0628\u0637 \u0645\u062A\u063A\u064A\u0631\u0627\u062A \u0627\u0644\u0628\u064A\u0626\u0629 \u0639\u0644\u0649 \u0627\u0644\u0633\u064A\u0631\u0641\u0631.");
    sql = (0, import_serverless.neon)(url);
  }
  return sql;
}
function ensureSchema() {
  if (!schemaReady) schemaReady = createSchema().catch((e) => {
    schemaReady = null;
    throw e;
  });
  return schemaReady;
}
async function createSchema() {
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
  for (const t of ["meds", "schedules", "lab_results", "symptoms", "food_logs", "persons"]) {
    await q(`CREATE TABLE IF NOT EXISTS ${t} (
      id text PRIMARY KEY,
      family_id text NOT NULL,
      server_seq bigint NOT NULL DEFAULT 0,
      data jsonb NOT NULL,
      updated_at bigint NOT NULL,
      deleted_at bigint
    )`);
  }
  for (const t of ["dose_events", "inventory_events"]) {
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
async function audit(familyId, userId, action, entity, entityId) {
  const q = getSql();
  await q`INSERT INTO audit_log (family_id, user_id, action, entity, entity_id, at)
          VALUES (${familyId}, ${userId}, ${action}, ${entity}, ${entityId}, ${Date.now()})`;
}

// server/api-src/_lib/auth.ts
var import_jose = require("jose");
function secretKey() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637 \u2014 \u0648\u0644\u0651\u062F \u0645\u0641\u062A\u0627\u062D\u0627\u064B \u0639\u0634\u0648\u0627\u0626\u064A\u0627\u064B \u0637\u0648\u064A\u0644\u0627\u064B \u0648\u0627\u0636\u0628\u0637\u0647 \u0641\u064A \u0645\u062A\u063A\u064A\u0631\u0627\u062A \u0627\u0644\u0628\u064A\u0626\u0629.");
  }
  return new TextEncoder().encode(s);
}
async function verifyToken(token, type) {
  try {
    const { payload } = await (0, import_jose.jwtVerify)(token, secretKey());
    if (payload.typ !== type) return null;
    return { sub: String(payload.sub), fam: String(payload.fam), role: payload.role };
  } catch {
    return null;
  }
}
async function requireAuth(req) {
  const raw = req.headers["authorization"] ?? "";
  const header = Array.isArray(raw) ? raw[0] ?? "" : raw;
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw httpError2(401, "\u0645\u0637\u0644\u0648\u0628 \u062A\u0633\u062C\u064A\u0644 \u062F\u062E\u0648\u0644.");
  const payload = await verifyToken(token, "access");
  if (!payload) throw httpError2(401, "\u0627\u0644\u062C\u0644\u0633\u0629 \u0645\u0646\u062A\u0647\u064A\u0629 \u2014 \u0633\u062C\u0651\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u0646 \u062C\u062F\u064A\u062F.");
  return {
    userId: payload.sub,
    familyId: payload.fam,
    role: payload.role ?? "member",
    login: ""
  };
}
function httpError2(status, message) {
  return Object.assign(new Error(message), { status });
}

// server/api-src/_handlers/backup.ts
async function handleStore(req, res) {
  if (req.method !== "POST") throw httpError(405, "\u0637\u0631\u064A\u0642\u0629 \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645\u0629.");
  await ensureSchema();
  const ctx = await requireAuth(req);
  const { cipher } = await readJson(req);
  if (!cipher || cipher.length < 24) throw httpError(400, "\u0646\u0633\u062E\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629.");
  if (cipher.length > 12e6) throw httpError(413, "\u0627\u0644\u0646\u0633\u062E\u0629 \u0643\u0628\u064A\u0631\u0629 \u062C\u062F\u0627\u064B.");
  const q = getSql();
  const rows = await q`SELECT id FROM backups WHERE family_id = ${ctx.familyId} ORDER BY created_at DESC`;
  const id = `bkp_${(0, import_node_crypto.randomBytes)(8).toString("hex")}`;
  await q`INSERT INTO backups (id, family_id, cipher, size, created_at)
          VALUES (${id}, ${ctx.familyId}, ${cipher}, ${cipher.length}, ${Date.now()})`;
  const extra = rows.slice(9);
  for (const r of extra) {
    await q`DELETE FROM backups WHERE id = ${r.id} AND family_id = ${ctx.familyId}`;
  }
  await audit(ctx.familyId, ctx.userId, "backup_store", "backup", id);
  json(req, res, 200, { id });
}
async function handleList(req, res) {
  await ensureSchema();
  const ctx = await requireAuth(req);
  const q = getSql();
  const rows = await q`SELECT id, size, created_at FROM backups
                       WHERE family_id = ${ctx.familyId} ORDER BY created_at DESC LIMIT 10`;
  json(req, res, 200, {
    backups: rows.map((r) => ({
      id: r.id,
      size: Number(r.size),
      createdAt: Number(r.created_at)
    }))
  });
}
async function handleGet(req, res) {
  await ensureSchema();
  const ctx = await requireAuth(req);
  const id = fullUrl(req).searchParams.get("id") ?? "";
  if (!id) throw httpError(400, "id \u0645\u0637\u0644\u0648\u0628.");
  const q = getSql();
  const rows = await q`SELECT cipher, created_at FROM backups
                       WHERE id = ${id} AND family_id = ${ctx.familyId}`;
  if (!rows.length) throw httpError(404, "\u0627\u0644\u0646\u0633\u062E\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629.");
  const r = rows[0];
  json(req, res, 200, { cipher: r.cipher, createdAt: Number(r.created_at) });
}

// server/api-src/backup/[action].ts
var action_default = handler(async (req, res) => {
  const action = routeParam(req, "action");
  switch (action) {
    case "store":
      return handleStore(req, res);
    case "list":
      return handleList(req, res);
    case "get":
      return handleGet(req, res);
    default:
      res.status(404).json({ error: "\u0639\u0645\u0644\u064A\u0629 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641\u0629." });
  }
});
