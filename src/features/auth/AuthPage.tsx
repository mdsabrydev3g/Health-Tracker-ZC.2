// features/auth — دخول / إنشاء عائلة / انضمام برمز دعوة.

import { useState } from 'react';
import { useSession } from '@/data/stores/session';
import { Button, Card, Field, inputCls } from '@/ui/components';

type View = 'login' | 'register' | 'join';

export function AuthPage() {
  const [view, setView] = useState<View>('login');
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-brand-50 to-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">💊</div>
          <h1 className="text-xl font-bold text-gray-800">رفيق الصحة</h1>
          <p className="text-sm text-gray-500 mt-1">رفيق الجرعات والصحة للعائلة</p>
        </div>
        <Card className="p-4">
          {view === 'login' && <LoginForm onSwitch={setView} />}
          {view === 'register' && <RegisterForm onSwitch={setView} />}
          {view === 'join' && <JoinForm onSwitch={setView} />}
        </Card>
        <p className="text-xs text-gray-400 text-center mt-4 leading-5">
          بياناتك الصحية تُخزَّن على جهازك وتتزامن مشفَّرة مع سيرفر عائلتك فقط.
          كل عائلة معزولة تماماً عن غيرها.
        </p>
      </div>
    </div>
  );
}

function LoginForm({ onSwitch }: { onSwitch: (v: View) => void }) {
  const { login } = useSession();
  const [loginName, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setErr('');
      try { await login(loginName, password); }
      catch (ex) { setErr((ex as Error).message); }
      finally { setBusy(false); }
    }}>
      <Field label="اسم الدخول"><input className={inputCls} value={loginName} onChange={(e) => setLogin(e.target.value)} /></Field>
      <Field label="كلمة المرور"><input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <Button type="submit" full disabled={busy}>دخول</Button>
      <div className="flex justify-between text-xs text-brand-700">
        <button type="button" onClick={() => onSwitch('register')}>إنشاء عائلة جديدة</button>
        <button type="button" onClick={() => onSwitch('join')}>انضمام برمز دعوة</button>
      </div>
    </form>
  );
}

function RegisterForm({ onSwitch }: { onSwitch: (v: View) => void }) {
  const { register } = useSession();
  const [familyName, setFamilyName] = useState('');
  const [name, setName] = useState('');
  const [loginName, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setErr('');
      try { await register({ familyName, login: loginName, password, name }); }
      catch (ex) { setErr((ex as Error).message); }
      finally { setBusy(false); }
    }}>
      <Field label="اسم العائلة"><input className={inputCls} value={familyName} onChange={(e) => setFamilyName(e.target.value)} /></Field>
      <Field label="اسمك"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="اسم الدخول"><input className={inputCls} value={loginName} onChange={(e) => setLogin(e.target.value)} required /></Field>
      <Field label="كلمة المرور" hint="8 أحرف على الأقل"><input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <Button type="submit" full disabled={busy}>إنشاء العائلة</Button>
      <button type="button" className="text-xs text-brand-700" onClick={() => onSwitch('login')}>لدي حساب — دخول</button>
    </form>
  );
}

function JoinForm({ onSwitch }: { onSwitch: (v: View) => void }) {
  const { join } = useSession();
  const [inviteCode, setInvite] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'mother' | 'member'>('mother');
  const [loginName, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setErr('');
      try { await join({ inviteCode, login: loginName, password, name, role }); }
      catch (ex) { setErr((ex as Error).message); }
      finally { setBusy(false); }
    }}>
      <Field label="رمز الدعوة" hint="من صفحة المزيد في جهاز المالك"><input className={inputCls} value={inviteCode} onChange={(e) => setInvite(e.target.value)} /></Field>
      <Field label="اسمك"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="صفتي في العائلة">
        <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as 'mother' | 'member')}>
          <option value="mother">الوالدة (منبّه كامل لكل جرعة)</option>
          <option value="member">عضو آخر</option>
        </select>
      </Field>
      <Field label="اسم الدخول"><input className={inputCls} value={loginName} onChange={(e) => setLogin(e.target.value)} required /></Field>
      <Field label="كلمة المرور" hint="8 أحرف على الأقل"><input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <Button type="submit" full disabled={busy}>انضمام</Button>
      <button type="button" className="text-xs text-brand-700" onClick={() => onSwitch('login')}>لدي حساب — دخول</button>
    </form>
  );
}
