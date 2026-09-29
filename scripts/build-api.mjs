// scripts/build-api.mjs — يولّد دوال Vercel مكتفية ذاتياً (CJS، بلا استيرادات محلية).
// مُ bundler الدوال على Vercel في هذا المشروع يفصل كل ملف، فأي استيراد محلي
// ينهار عند التشغيل — لذلك نُضمّن كل شيء الآن بـ esbuild قبل النشر.
// الخارجي الوحيد: حزم package.json المثبتة (node_modules متاح وقت التشغيل).

import { build } from 'esbuild';
import { readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const externals = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

/** مسارات الدوال: المصدر في server/api-src → الناتج في api */
const routes = [
  ['health.ts', 'health.js'],
  ['ping.ts', 'ping.js'],
  ['sync/push.ts', 'sync/push.js'],
  ['sync/pull.ts', 'sync/pull.js'],
  ['push/register.ts', 'push/register.js'],
  ['push/broadcast.ts', 'push/broadcast.js'],
  ['cron/missed.ts', 'cron/missed.js'],
  ['auth/[action].ts', 'auth/[action].js'],
  ['ai/[action].ts', 'ai/[action].js'],
  ['backup/[action].ts', 'backup/[action].js'],
];

const SRC = 'server/api-src';
let failed = 0;

for (const [src, out] of routes) {
  try {
    await build({
      entryPoints: [join(SRC, src)],
      outfile: join('api', out),
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      sourcemap: false,
      minify: false,
      legalComments: 'none',
      external: externals,
      logLevel: 'silent',
    });
    console.log('✓', out);
  } catch (e) {
    failed++;
    console.error('✗', out, '\n ', e.message);
  }
}

// tsconfig خاص بالمولَّدات لا يلزم — الملفات JS جاهزة
if (failed) {
  console.error(`فشل بناء ${failed} دالة`);
  process.exit(1);
}
console.log('تم توليد', routes.length, 'دالة مكتفية ذاتياً في api/');
