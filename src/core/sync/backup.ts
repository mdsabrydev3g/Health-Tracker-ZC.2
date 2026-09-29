// ============================================================
// core/sync/backup — تشفير النسخ الاحتياطية من جهة العميل.
// AES-256-GCM بمفتاح مشتق من كلمة مرور العائلة عبر PBKDF2.
// السيرفر يخزّن نصاً مشفّراً فقط. نقية (WebCrypto).
// ============================================================

const enc = new TextEncoder();
const dec = new TextDecoder();

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: 310_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** يشفّر نصاً (JSON للنسخة) ويعيد حزمة base64: salt ‖ iv ‖ ciphertext */
export async function encryptBackup(plain: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    enc.encode(plain),
  );
  const blob = new Uint8Array(salt.length + iv.length + ct.byteLength);
  blob.set(salt, 0);
  blob.set(iv, salt.length);
  blob.set(new Uint8Array(ct), salt.length + iv.length);
  return toBase64(blob);
}

/** يفك الحزمة؛ يرمي خطأ إن كانت كلمة المرور خاطئة أو البيانات تالفة */
export async function decryptBackup(packageB64: string, password: string): Promise<string> {
  const blob = fromBase64(packageB64);
  const salt = blob.slice(0, 16);
  const iv = blob.slice(16, 28);
  const ct = blob.slice(28);
  const key = await deriveKey(password, salt);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    ct as unknown as BufferSource,
  );
  return dec.decode(plain);
}

function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
