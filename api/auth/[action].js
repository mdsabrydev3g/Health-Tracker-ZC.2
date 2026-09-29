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

// server/api-src/auth/[action].ts
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

// server/api-src/_handlers/auth.ts
var import_node_crypto2 = require("node:crypto");

// server/api-src/_lib/db.ts
var import_serverless = require("@neondatabase/serverless");
var sql = null;
function getSql() {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637 \u2014 \u0627\u0636\u0628\u0637 \u0645\u062A\u063A\u064A\u0631\u0627\u062A \u0627\u0644\u0628\u064A\u0626\u0629 \u0639\u0644\u0649 \u0627\u0644\u0633\u064A\u0631\u0641\u0631.");
    sql = (0, import_serverless.neon)(url);
  }
  return sql;
}
async function audit(familyId, userId, action, entity, entityId) {
  const q = getSql();
  await q`INSERT INTO audit_log (family_id, user_id, action, entity, entity_id, at)
          VALUES (${familyId}, ${userId}, ${action}, ${entity}, ${entityId}, ${Date.now()})`;
}

// server/api-src/_lib/auth.ts
var import_jose = require("jose");
var import_node_crypto = require("node:crypto");
function secretKey() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637 \u2014 \u0648\u0644\u0651\u062F \u0645\u0641\u062A\u0627\u062D\u0627\u064B \u0639\u0634\u0648\u0627\u0626\u064A\u0627\u064B \u0637\u0648\u064A\u0644\u0627\u064B \u0648\u0627\u0636\u0628\u0637\u0647 \u0641\u064A \u0645\u062A\u063A\u064A\u0631\u0627\u062A \u0627\u0644\u0628\u064A\u0626\u0629.");
  }
  return new TextEncoder().encode(s);
}
function hashPassword(password) {
  const salt = (0, import_node_crypto.randomBytes)(16);
  const h = (0, import_node_crypto.scryptSync)(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${h.toString("hex")}`;
}
function verifyPassword(password, stored) {
  try {
    const [scheme, saltHex, hashHex] = stored.split("$");
    if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
    const h = (0, import_node_crypto.scryptSync)(password, Buffer.from(saltHex, "hex"), 64);
    const expected = Buffer.from(hashHex, "hex");
    return h.length === expected.length && (0, import_node_crypto.timingSafeEqual)(h, expected);
  } catch {
    return false;
  }
}
async function signAccess(userId, familyId, role) {
  return new import_jose.SignJWT({ sub: userId, fam: familyId, role, typ: "access" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("15m").sign(secretKey());
}
async function signRefresh(userId, familyId) {
  return new import_jose.SignJWT({ sub: userId, fam: familyId, typ: "refresh" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("60d").sign(secretKey());
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

// server/api-src/_handlers/auth.ts
async function issueTokens(userId, familyId, role) {
  return {
    accessToken: await signAccess(userId, familyId, role),
    refreshToken: await signRefresh(userId, familyId)
  };
}
async function handleRegister(req, res) {
  const body = await readJson(req);
  if (!body.login || !body.password || body.password.length < 8) {
    throw httpError(400, "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 8 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.");
  }
  const q = getSql();
  const exists = await q`SELECT id FROM users WHERE login = ${body.login}`;
  if (exists.length) throw httpError(409, "\u0627\u0633\u0645 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0627\u0644\u0641\u0639\u0644.");
  const familyId = `fam_${(0, import_node_crypto2.randomBytes)(8).toString("hex")}`;
  const userId = `usr_${(0, import_node_crypto2.randomBytes)(8).toString("hex")}`;
  const personId = `prs_${(0, import_node_crypto2.randomBytes)(8).toString("hex")}`;
  const inviteCode = (0, import_node_crypto2.randomBytes)(4).toString("hex").toUpperCase();
  const now = Date.now();
  await q`INSERT INTO families (id, name, tz, invite_code, created_at)
          VALUES (${familyId}, ${body.familyName || "\u0639\u0627\u0626\u0644\u062A\u064A"}, ${Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Cairo"}, ${inviteCode}, ${now})`;
  await q`INSERT INTO users (id, family_id, login, pass_hash, name, role, person_id, created_at)
          VALUES (${userId}, ${familyId}, ${body.login}, ${hashPassword(body.password)}, ${body.name || body.login}, 'owner', ${personId}, ${now})`;
  await q`INSERT INTO persons (id, family_id, server_seq, data, updated_at)
          VALUES (${personId}, ${familyId}, 0, ${JSON.stringify({
    id: personId,
    familyId,
    name: body.name || "\u0623\u0646\u0627",
    role: "owner",
    createdAt: now,
    updatedAt: now,
    serverSeq: 0
  })}, ${now})`;
  await audit(familyId, userId, "register", "family", familyId);
  json(req, res, 200, {
    user: { id: userId, familyId, login: body.login, name: body.name || body.login, role: "owner", personId },
    family: { id: familyId, name: body.familyName || "\u0639\u0627\u0626\u0644\u062A\u064A", inviteCode },
    tokens: await issueTokens(userId, familyId, "owner")
  });
}
async function handleJoin(req, res) {
  const body = await readJson(req);
  if (!body.inviteCode || !body.login || body.password.length < 8) {
    throw httpError(400, "\u0628\u064A\u0627\u0646\u0627\u062A \u0646\u0627\u0642\u0635\u0629 \u0623\u0648 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0623\u0642\u0635\u0631 \u0645\u0646 8 \u0623\u062D\u0631\u0641.");
  }
  const q = getSql();
  const fam = await q`SELECT id FROM families WHERE invite_code = ${body.inviteCode.trim().toUpperCase()}`;
  if (!fam.length) throw httpError(404, "\u0631\u0645\u0632 \u0627\u0644\u062F\u0639\u0648\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D.");
  const familyId = String(fam[0].id);
  const exists = await q`SELECT id FROM users WHERE login = ${body.login}`;
  if (exists.length) throw httpError(409, "\u0627\u0633\u0645 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0627\u0644\u0641\u0639\u0644.");
  const userId = `usr_${(0, import_node_crypto2.randomBytes)(8).toString("hex")}`;
  const personId = `prs_${(0, import_node_crypto2.randomBytes)(8).toString("hex")}`;
  const now = Date.now();
  const role = body.role === "mother" ? "mother" : "member";
  await q`INSERT INTO users (id, family_id, login, pass_hash, name, role, person_id, created_at)
          VALUES (${userId}, ${familyId}, ${body.login}, ${hashPassword(body.password)}, ${body.name || body.login}, ${role}, ${personId}, ${now})`;
  await q`INSERT INTO persons (id, family_id, server_seq, data, updated_at)
          VALUES (${personId}, ${familyId}, 0, ${JSON.stringify({
    id: personId,
    familyId,
    name: body.name || body.login,
    role,
    createdAt: now,
    updatedAt: now,
    serverSeq: 0
  })}, ${now})`;
  await audit(familyId, userId, "join", "family", familyId);
  json(req, res, 200, {
    user: { id: userId, familyId, login: body.login, name: body.name || body.login, role, personId },
    tokens: await issueTokens(userId, familyId, role)
  });
}
async function handleLogin(req, res) {
  const { login, password } = await readJson(req);
  const q = getSql();
  const rows = await q`SELECT id, family_id, pass_hash, name, role, person_id FROM users WHERE login = ${login}`;
  const u = rows[0];
  if (!u || !verifyPassword(password, u.pass_hash)) {
    throw httpError(401, "\u0627\u0633\u0645 \u0627\u0644\u062F\u062E\u0648\u0644 \u0623\u0648 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629.");
  }
  json(req, res, 200, {
    user: { id: u.id, familyId: u.family_id, login, name: u.name, role: u.role, personId: u.person_id ?? void 0 },
    tokens: await issueTokens(u.id, u.family_id, u.role)
  });
}
async function handleRefresh(req, res) {
  const { refreshToken } = await readJson(req);
  const payload = await verifyToken(refreshToken ?? "", "refresh");
  if (!payload) throw httpError(401, "\u0627\u0646\u062A\u0647\u062A \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u062C\u0644\u0633\u0629 \u2014 \u0633\u062C\u0651\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u0646 \u062C\u062F\u064A\u062F.");
  const q = getSql();
  const rows = await q`SELECT role FROM users WHERE id = ${payload.sub} AND family_id = ${payload.fam}`;
  if (!rows.length) throw httpError(401, "\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
  const role = String(rows[0].role);
  json(req, res, 200, { tokens: await issueTokens(payload.sub, payload.fam, role) });
}
async function handleMe(req, res) {
  const raw = req.headers["authorization"] ?? "";
  const header = Array.isArray(raw) ? raw[0] ?? "" : raw;
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = await verifyToken(token, "access");
  if (!payload) throw httpError(401, "\u0627\u0644\u062C\u0644\u0633\u0629 \u0645\u0646\u062A\u0647\u064A\u0629 \u2014 \u0633\u062C\u0651\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u0646 \u062C\u062F\u064A\u062F.");
  const q = getSql();
  const fam = await q`SELECT id, name, tz, invite_code FROM families WHERE id = ${payload.fam}`;
  const me = await q`SELECT id, family_id, login, name, role, person_id FROM users WHERE id = ${payload.sub}`;
  const u = me[0];
  if (!u) throw httpError(401, "\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
  const f = fam[0];
  const out = {
    id: String(u.id),
    familyId: String(u.family_id),
    login: String(u.login),
    name: String(u.name),
    role: String(u.role),
    personId: u.person_id ? String(u.person_id) : void 0
  };
  if (f) {
    out.family = {
      id: String(f.id),
      name: String(f.name),
      tz: String(f.tz),
      // رمز الدعوة يظهر للمالك فقط
      inviteCode: String(u.role) === "owner" ? String(f.invite_code) : void 0
    };
  }
  json(req, res, 200, out);
}

// server/api-src/auth/[action].ts
var action_default = handler(async (req, res) => {
  const action = routeParam(req, "action");
  switch (action) {
    case "register":
      return handleRegister(req, res);
    case "join":
      return handleJoin(req, res);
    case "login":
      return handleLogin(req, res);
    case "refresh":
      return handleRefresh(req, res);
    case "me":
      return handleMe(req, res);
    default:
      res.status(404).json({ error: "\u0639\u0645\u0644\u064A\u0629 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641\u0629." });
  }
});
