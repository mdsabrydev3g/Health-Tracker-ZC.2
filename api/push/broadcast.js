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

// server/api-src/push/broadcast.ts
var broadcast_exports = {};
__export(broadcast_exports, {
  default: () => broadcast_default
});
module.exports = __toCommonJS(broadcast_exports);

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
  if (!token) throw httpError(401, "\u0645\u0637\u0644\u0648\u0628 \u062A\u0633\u062C\u064A\u0644 \u062F\u062E\u0648\u0644.");
  const payload = await verifyToken(token, "access");
  if (!payload) throw httpError(401, "\u0627\u0644\u062C\u0644\u0633\u0629 \u0645\u0646\u062A\u0647\u064A\u0629 \u2014 \u0633\u062C\u0651\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u0646 \u062C\u062F\u064A\u062F.");
  return {
    userId: payload.sub,
    familyId: payload.fam,
    role: payload.role ?? "member",
    login: ""
  };
}
function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

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
function httpError2(status, message) {
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
  if (b === void 0 || b === null) throw httpError2(400, "\u0637\u0644\u0628 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D (JSON).");
  if (typeof b === "string") {
    try {
      return JSON.parse(b);
    } catch {
      throw httpError2(400, "\u0637\u0644\u0628 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D (JSON).");
    }
  }
  return b;
}

// server/api-src/_lib/fcm.ts
var import_jose2 = require("jose");
function fcmConfigured() {
  return Boolean(process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY);
}
var cachedToken = null;
async function getAccessToken() {
  if (cachedToken && cachedToken.exp > Date.now() + 6e4) return cachedToken.token;
  const pkcs8 = (process.env.FCM_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").replace(/^"|"$/g, "");
  const key = await (0, import_jose2.importPKCS8)(pkcs8, "RS256");
  const now = Math.floor(Date.now() / 1e3);
  const jwt = await new import_jose2.SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" }).setProtectedHeader({ alg: "RS256" }).setIssuer(process.env.FCM_CLIENT_EMAIL).setAudience("https://oauth2.googleapis.com/token").setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  if (!res.ok) throw new Error(`\u0641\u0634\u0644 \u0645\u0635\u0627\u062F\u0642\u0629 FCM: ${res.status}`);
  const data = await res.json();
  cachedToken = { token: data.access_token, exp: Date.now() + data.expires_in * 1e3 };
  return data.access_token;
}
async function sendPush(msg) {
  if (!fcmConfigured()) return false;
  const token = await getAccessToken();
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${process.env.FCM_PROJECT_ID}/messages:send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: msg.token,
          notification: { title: msg.title, body: msg.body },
          data: msg.data,
          android: {
            priority: msg.urgent ? "high" : "normal",
            notification: {
              sound: msg.urgent ? "default" : void 0,
              channel_id: msg.urgent ? "urgent" : "general"
            }
          }
        }
      })
    }
  );
  return res.ok;
}

// server/api-src/push/broadcast.ts
var TITLES = {
  dose_taken: "\u062A\u0645 \u0623\u062E\u0630 \u062C\u0631\u0639\u0629",
  dose_missed: "\u062C\u0631\u0639\u0629 \u0641\u0627\u0626\u062A\u0629",
  stock_urgent: "\u0646\u0641\u0627\u062F \u0648\u0634\u064A\u0643 \u0644\u062F\u0648\u0627\u0621 \u0647\u0627\u0645",
  stock_low: "\u0645\u062E\u0632\u0648\u0646 \u062F\u0648\u0627\u0621 \u064A\u0646\u062E\u0641\u0636"
};
var broadcast_default = handler(async (req, res) => {
  if (req.method !== "POST") throw httpError(405, "\u0637\u0631\u064A\u0642\u0629 \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645\u0629.");
  await ensureSchema();
  const ctx = await requireAuth(req);
  const body = await readJson(req);
  if (!TITLES[body.kind]) throw httpError(400, "\u0646\u0648\u0639 \u0625\u0634\u0639\u0627\u0631 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641.");
  const q = getSql();
  const devices = await q`SELECT id, push_token FROM devices
                          WHERE family_id = ${ctx.familyId} AND push_token IS NOT NULL AND push_token <> ''`;
  let sent = 0;
  const urgent = body.kind === "stock_urgent";
  const title = TITLES[body.kind];
  const med = String(body.payload?.medName ?? "");
  const p = body.payload?.personName ? `${body.payload.personName}: ` : "";
  const bodyText = body.kind === "dose_taken" ? `${p}\u0623\u064F\u062E\u0630\u062A \u062C\u0631\u0639\u0629 ${med}` : body.kind === "dose_missed" ? `${p}\u0641\u0627\u062A\u062A \u062C\u0631\u0639\u0629 ${med}` : body.kind === "stock_urgent" ? `${med}: \u0628\u0627\u0642\u064A ~${body.payload?.daysRemaining ?? 0} \u064A\u0648\u0645 \u2014 \u0646\u0641\u0627\u062F \u0648\u0634\u064A\u0643 \u0644\u062F\u0648\u0627\u0621 \u0647\u0627\u0645` : `${med}: \u0628\u0627\u0642\u064A ~${body.payload?.daysRemaining ?? 0} \u064A\u0648\u0645`;
  for (const d of devices) {
    if (body.deviceId && d.id === body.deviceId) continue;
    const ok = await sendPush({
      token: d.push_token,
      title,
      body: bodyText,
      urgent,
      data: { kind: body.kind, ...bodyToData(body.payload) }
    });
    if (ok) sent++;
  }
  await audit(ctx.familyId, ctx.userId, `broadcast:${body.kind}`, "push", `${sent}/${devices.length}`);
  json(req, res, 200, { sent, total: devices.length, fcm: fcmConfigured() });
});
function bodyToData(payload) {
  const out = {};
  for (const [k, v] of Object.entries(payload)) out[k] = String(v ?? "");
  return out;
}
