// api/_lib/fcm — إرسال Push عبر Firebase Cloud Messaging HTTP v1
// (بدون حزمة firebase-admin: توقيع JWT RS256 بـ jose). إن لم تُضبط
// متغيرات البيئة فتعمل الدوال بلا أثر (disabled) بلا أخطاء.

import { SignJWT, importPKCS8 } from 'jose';

export function fcmConfigured(): boolean {
  return Boolean(process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY);
}

let cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  const pkcs8 = (process.env.FCM_PRIVATE_KEY ?? '')
    .replace(/\\n/g, '\n')
    .replace(/^"|"$/g, '');
  const key = await importPKCS8(pkcs8, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(process.env.FCM_CLIENT_EMAIL!)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`فشل مصادقة FCM: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

export interface FcmMessage {
  token: string;
  title: string;
  body: string;
  /** صوت/تنبيه عاجل فقط للأدوية الهامة */
  urgent: boolean;
  data?: Record<string, string>;
}

export async function sendPush(msg: FcmMessage): Promise<boolean> {
  if (!fcmConfigured()) return false;
  const token = await getAccessToken();
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${process.env.FCM_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: msg.token,
          notification: { title: msg.title, body: msg.body },
          data: msg.data,
          android: {
            priority: msg.urgent ? 'high' : 'normal',
            notification: {
              sound: msg.urgent ? 'default' : undefined,
              channel_id: msg.urgent ? 'urgent' : 'general',
            },
          },
        },
      }),
    },
  );
  return res.ok;
}
