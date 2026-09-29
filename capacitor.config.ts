import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor — تطبيق أندرويد. يفتح النسخة الأونلاين (server.url) مع
// ذاكرة محلية Dexie كاملة داخل WebView: يعمل أوفلاين ويتزامن عند الاتصال.
const config: CapacitorConfig = {
  appId: 'com.family.healthtracker',
  appName: 'رفيق الصحة',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  server: {
    // استبدل بعنوان نشرك الفعلي بعد النشر على Vercel:
    url: 'https://health-tracker.example.vercel.app',
    cleartext: false,
    androidScheme: 'https',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#0f766e',
      sound: 'alarm.wav',
    },
  },
};

export default config;
