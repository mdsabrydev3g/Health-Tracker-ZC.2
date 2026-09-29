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

// server/api-src/cron/missed.ts
var missed_exports = {};
__export(missed_exports, {
  default: () => missed_default
});
module.exports = __toCommonJS(missed_exports);

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

// server/api-src/_lib/fcm.ts
var import_jose = require("jose");
function fcmConfigured() {
  return Boolean(process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY);
}
var cachedToken = null;
async function getAccessToken() {
  if (cachedToken && cachedToken.exp > Date.now() + 6e4) return cachedToken.token;
  const pkcs8 = (process.env.FCM_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").replace(/^"|"$/g, "");
  const key = await (0, import_jose.importPKCS8)(pkcs8, "RS256");
  const now = Math.floor(Date.now() / 1e3);
  const jwt = await new import_jose.SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" }).setProtectedHeader({ alg: "RS256" }).setIssuer(process.env.FCM_CLIENT_EMAIL).setAudience("https://oauth2.googleapis.com/token").setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
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

// server/api-src/cron/_time.ts
function zonedTimeToEpoch(dayKey, hhmm, tz) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  let offset = tzOffsetMs(tz, guess);
  let result = guess - offset;
  offset = tzOffsetMs(tz, result);
  result = guess - offset;
  return result;
}
function tzOffsetMs(tz, at) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = dtf.formatToParts(new Date(at));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUTC - at;
}

// server/api-src/cron/missed.ts
var missed_default = handler(async (req, res) => {
  await ensureSchema();
  if (!fcmConfigured()) {
    json(req, res, 200, { ok: true, skipped: "FCM \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637" });
    return;
  }
  const q = getSql();
  const families = await q`SELECT id, tz FROM families`;
  const now = Date.now();
  let notified = 0;
  for (const fam of families) {
    const scheds = await q`SELECT data FROM schedules WHERE family_id = ${fam.id} AND deleted_at IS NULL`;
    const meds = await q`SELECT id, data FROM meds WHERE family_id = ${fam.id} AND deleted_at IS NULL`;
    const events = await q`SELECT data FROM dose_events WHERE family_id = ${fam.id}
                           AND (data->>'plannedFor')::bigint > ${now - 26 * 36e5}`;
    const medName = new Map(meds.map((m) => [m.id, m.data.nameAr]));
    const doneKeys = new Set(events.map((e) => `${e.data.scheduleId ?? ""}|${e.data.plannedFor}`));
    const dayKeys = [0, 1].map((i) => new Date(now - i * 864e5).toISOString().slice(0, 10));
    const missed = [];
    for (const s of scheds) {
      if (!s.data?.active) continue;
      for (const dayKey of dayKeys) {
        const wd = new Date(zonedTimeToEpoch(dayKey, "12:00", fam.tz)).getUTCDay();
        if (s.data.daysOfWeek && !s.data.daysOfWeek.includes(wd)) continue;
        for (const time of s.data.times ?? []) {
          const pf = zonedTimeToEpoch(dayKey, time, fam.tz);
          if (pf + 30 * 6e4 >= now) continue;
          if (doneKeys.has(`${s.data.id}|${pf}`)) continue;
          missed.push({ medName: medName.get(s.data.medId) ?? "", time });
        }
      }
    }
    if (!missed.length) continue;
    const devices = await q`SELECT push_token FROM devices
                            WHERE family_id = ${fam.id} AND push_token IS NOT NULL AND push_token <> ''`;
    for (const d of devices.slice(0, 20)) {
      const ok = await sendPush({
        token: d.push_token,
        title: `\u0641\u0627\u062A\u062A ${missed.length} \u062C\u0631\u0639\u0629/\u062C\u0631\u0639\u0627\u062A`,
        body: missed.slice(0, 3).map((m) => `${m.medName} (${m.time})`).join("\u060C ") + (missed.length > 3 ? "\u2026" : ""),
        urgent: false,
        data: { kind: "dose_missed", count: String(missed.length) }
      });
      if (ok) notified++;
    }
  }
  json(req, res, 200, { ok: true, notified });
});
