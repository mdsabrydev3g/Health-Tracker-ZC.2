// app/App — الجذر: شاشة دخول إن لم توجد جلسة، وإلا الواجهة الرئيسية.

import { useSession } from '@/data/stores/session';
import { useAppInit } from './providers';
import { AuthPage } from '@/features/auth/AuthPage';
import { Shell } from './shell';
import { SnackbarHost, ConfirmHost } from '@/ui/components';
import { ModeGate } from '@/modes/ModeGate';

export default function App() {
  useAppInit();
  const { ready, user } = useSession();

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-brand-700">
        <div className="text-center">
          <div className="text-5xl mb-3">💊</div>
          <div className="font-bold">رفيق الصحة</div>
          <div className="text-xs text-gray-400 mt-1">جارٍ التحضير…</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {user ? <Shell /> : <AuthPage />}
      <ModeGate />
      <SnackbarHost />
      <ConfirmHost />
    </>
  );
}
