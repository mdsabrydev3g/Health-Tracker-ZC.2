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

// server/api-src/ai/[action].ts
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
async function nextFamilySeq(familyId) {
  const q = getSql();
  const rows = await q`UPDATE families SET last_seq = last_seq + 1 WHERE id = ${familyId} RETURNING last_seq`;
  return Number(rows[0].last_seq);
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

// server/api-src/_lib/aiProviders.ts
function providersStatus() {
  return [
    { id: "gemini", available: Boolean(process.env.GEMINI_API_KEY) },
    { id: "groq", available: Boolean(process.env.GROQ_API_KEY) },
    { id: "openrouter", available: Boolean(process.env.OPENROUTER_API_KEY) },
    { id: "pollinations", available: true }
    // بلا مفتاح — الخيار الأخير
  ];
}
function splitDataUrl(dataUrl) {
  if (!dataUrl) return null;
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], b64: m[2] };
}
async function callGemini(req) {
  const model = req.fileDataUrl ? "gemini-1.5-flash" : "gemini-1.5-flash";
  const parts = req.messages.map((m) => ({ text: m.content }));
  const file = splitDataUrl(req.fileDataUrl);
  if (file) parts.push({ inline_data: { mime_type: file.mime, data: file.b64 } });
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: req.messages.find((m) => m.role === "system")?.content ?? "" }] },
        contents: [{ role: "user", parts: parts.filter((p) => !req.messages.some((m) => m.role === "system" && m.content === p.text)) }],
        generationConfig: { maxOutputTokens: req.maxTokens ?? 2048 }
      })
    }
  );
  if (res.status === 429) throw Object.assign(new Error("\u062D\u0635\u0629 Gemini \u0627\u0644\u0644\u062D\u0638\u064A\u0629 \u0645\u0645\u062A\u0644\u0626\u0629 (429)"), { status: 429 });
  if (!res.ok) throw new Error(`Gemini: ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return { text, model };
}
function toOpenAiMessages(req) {
  return req.messages.map((m, i) => {
    if (i === req.messages.length - 1 && req.fileDataUrl && m.role === "user") {
      return {
        role: m.role,
        content: [
          { type: "text", text: m.content },
          { type: "image_url", image_url: { url: req.fileDataUrl } }
        ]
      };
    }
    return { role: m.role, content: m.content };
  });
}
async function callOpenAiCompatible(url, apiKey, model, req, extraHeaders = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, ...extraHeaders },
    body: JSON.stringify({
      model,
      messages: toOpenAiMessages(req),
      max_tokens: req.maxTokens ?? 2048
    })
  });
  if (res.status === 429) throw Object.assign(new Error(`\u062D\u0635\u0629 ${model} \u0627\u0644\u0644\u062D\u0638\u064A\u0629 \u0645\u0645\u062A\u0644\u0626\u0629 (429)`), { status: 429 });
  if (!res.ok) throw new Error(`${model}: ${res.status}`);
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? "", model };
}
async function callPollinations(req) {
  const res = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai",
      messages: req.messages,
      max_tokens: req.maxTokens ?? 2048
    })
  });
  if (res.status === 429) throw Object.assign(new Error("\u062D\u0635\u0629 Pollinations \u0627\u0644\u0644\u062D\u0638\u064A\u0629 \u0645\u0645\u062A\u0644\u0626\u0629 (429)"), { status: 429 });
  if (!res.ok) throw new Error(`Pollinations: ${res.status}`);
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? "", model: "pollinations/openai" };
}
async function completeWithFallback(req) {
  const chain = providersStatus().filter((p) => p.available);
  const errors = [];
  for (const p of chain) {
    try {
      if (p.id === "gemini") {
        const r = await callGemini(req);
        return { text: r.text, provider: "gemini", model: r.model };
      }
      if (p.id === "groq") {
        const r = await callOpenAiCompatible(
          "https://api.groq.com/openai/v1/chat/completions",
          process.env.GROQ_API_KEY,
          req.fileDataUrl ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile",
          req
        );
        return { text: r.text, provider: "groq", model: r.model };
      }
      if (p.id === "openrouter") {
        const r = await callOpenAiCompatible(
          "https://openrouter.ai/api/v1/chat/completions",
          process.env.OPENROUTER_API_KEY,
          req.fileDataUrl ? "google/gemini-flash-1.5:free" : "meta-llama/llama-3.3-70b-instruct:free",
          req,
          { "HTTP-Referer": "health-tracker", "X-Title": "Health Tracker" }
        );
        return { text: r.text, provider: "openrouter", model: r.model };
      }
      if (p.id === "pollinations") {
        const r = await callPollinations(req);
        return { text: r.text, provider: "pollinations", model: r.model };
      }
    } catch (e) {
      errors.push(`${p.id}: ${e.message}`);
    }
  }
  throw new Error(
    errors.length ? `\u062A\u0639\u0630\u0631 \u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u0637\u0644\u0628 \u0644\u062F\u0649 \u062C\u0645\u064A\u0639 \u0627\u0644\u0645\u0632\u0648\u062F\u064A\u0646 (${errors.join(" | ")})` : "\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u0632\u0648\u062F AI \u0645\u0636\u0628\u0648\u0637 \u0639\u0644\u0649 \u0627\u0644\u0633\u064A\u0631\u0641\u0631."
  );
}

// server/api-src/_handlers/ai.ts
var DAILY_LIMIT = 60;
var SAFETY_AR = [
  "\u0623\u0646\u062A \u0645\u0633\u0627\u0639\u062F \u0635\u062D\u064A \u0644\u0644\u0642\u0631\u0627\u0621\u0629 \u0648\u0627\u0644\u062A\u0646\u0638\u064A\u0645 \u0641\u0642\u0637\u060C \u0648\u0644\u064A\u0633 \u0637\u0628\u064A\u0628\u0627\u064B.",
  "\u0645\u0645\u0646\u0648\u0639 \u0645\u0646\u0639\u0627\u064B \u0628\u0627\u062A\u0627\u064B \u0627\u0642\u062A\u0631\u0627\u062D \u062A\u063A\u064A\u064A\u0631 \u062C\u0631\u0639\u0629\u060C \u0623\u0648 \u0625\u064A\u0642\u0627\u0641 \u062F\u0648\u0627\u0621\u060C \u0623\u0648 \u0628\u062F\u0621 \u062F\u0648\u0627\u0621\u060C \u0623\u0648 \u062A\u0634\u062E\u064A\u0635 \u062D\u0627\u0644\u0629.",
  "\u0627\u0634\u0631\u062D \u0627\u0644\u0645\u0635\u0637\u0644\u062D\u0627\u062A \u0648\u0627\u0644\u0642\u064A\u0645 \u0628\u0628\u0633\u0627\u0637\u0629\u060C \u0648\u0642\u0627\u0631\u0646 \u0627\u0644\u0642\u064A\u0645 \u0628\u0646\u0637\u0627\u0642\u0647\u0627 \u0627\u0644\u0637\u0628\u064A\u0639\u064A \u0625\u0646 \u0648\u0631\u062F \u0641\u064A \u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u0641\u0642\u0637.",
  "\u0625\u0646 \u0643\u0627\u0646\u062A \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0646\u0627\u0642\u0635\u0629 \u0642\u0644 \u0630\u0644\u0643 \u0628\u0648\u0636\u0648\u062D\u060C \u0648\u0644\u0627 \u062A\u062E\u062A\u0631\u0639 \u0623\u064A \u0642\u064A\u0645 \u0623\u0648 \u0623\u0633\u0645\u0627\u0621 \u0623\u062F\u0648\u064A\u0629.",
  "\u0627\u062E\u062A\u0645 \u0643\u0644 \u0631\u062F \u0628\u0633\u0637\u0631: \xAB\u0647\u0630\u0627 \u0645\u0633\u0627\u0639\u062F \u062A\u0646\u0638\u064A\u0645\u064A \u0648\u0644\u064A\u0633 \u062A\u0634\u062E\u064A\u0635\u0627\u064B \u0637\u0628\u064A\u0627\u064B \u2014 \u0631\u0627\u062C\u0639 \u0637\u0628\u064A\u0628\u0643.\xBB"
].join("\n");
var MAX_FILE_BYTES = 6 * 1024 * 1024;
async function handleStatus(req, res) {
  const providers = providersStatus();
  json(req, res, 200, { providers, any: providers.some((p) => p.available) });
}
async function handleRun(req, res) {
  if (req.method !== "POST") throw httpError(405, "\u0637\u0631\u064A\u0642\u0629 \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645\u0629.");
  await ensureSchema();
  const ctx = await requireAuth(req);
  const body = await readJson(req);
  if (body.fileDataUrl && body.fileDataUrl.length > MAX_FILE_BYTES) {
    throw httpError(413, "\u0627\u0644\u0645\u0644\u0641 \u0643\u0628\u064A\u0631 \u062C\u062F\u0627\u064B \u2014 \u0627\u0644\u062D\u062F 6 \u0645\u064A\u062C\u0627\u0628\u0627\u064A\u062A.");
  }
  const q = getSql();
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const rows = await q`SELECT ai_day, ai_calls_today FROM families WHERE id = ${ctx.familyId}`;
  const f = rows[0];
  if (f && f.ai_day === today && f.ai_calls_today >= DAILY_LIMIT) {
    throw httpError(429, `\u0628\u0644\u063A\u062A \u062D\u062F \u0627\u0644\u064A\u0648\u0645 (${DAILY_LIMIT} \u0637\u0644\u0628\u0627\u064B) \u2014 \u062D\u0645\u0627\u064A\u0629 \u0644\u0644\u062D\u0635\u0629 \u0627\u0644\u0645\u062C\u0627\u0646\u064A\u0629. \u062C\u0631\u0651\u0628 \u063A\u062F\u0627\u064B.`);
  }
  const messages = [{ role: "system", content: SAFETY_AR }, ...body.messages ?? []];
  const result = await completeWithFallback({
    capability: body.capability ?? "chat",
    messages,
    fileDataUrl: body.fileDataUrl,
    maxTokens: body.maxTokens
  });
  if (f && f.ai_day === today) {
    await q`UPDATE families SET ai_calls_today = ai_calls_today + 1 WHERE id = ${ctx.familyId}`;
  } else {
    await q`UPDATE families SET ai_day = ${today}, ai_calls_today = 1 WHERE id = ${ctx.familyId}`;
    await nextFamilySeq(ctx.familyId);
  }
  json(req, res, 200, { text: result.text, provider: result.provider, model: result.model });
}

// server/api-src/ai/[action].ts
var action_default = handler(async (req, res) => {
  const action = routeParam(req, "action");
  switch (action) {
    case "status":
      return handleStatus(req, res);
    case "run":
    case "summarize":
    case "chat":
      return handleRun(req, res);
    default:
      res.status(404).json({ error: "\u0639\u0645\u0644\u064A\u0629 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641\u0629." });
  }
});
