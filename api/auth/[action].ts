// api/auth/[action] — موجّه واحد لكل عمليات المصادقة:
// register | join | login | refresh | me
// (خطة Vercel Hobby تسمح بـ12 دالة كحد أقصى — الدمج يخفض العدد الكلي)

import { handler, routeParam } from '../_lib/http';
import { handleRegister, handleJoin, handleLogin, handleRefresh, handleMe } from '../_handlers/auth';

export default handler(async (req, res) => {
  const action = routeParam(req, 'action');
  switch (action) {
    case 'register': return handleRegister(req, res);
    case 'join': return handleJoin(req, res);
    case 'login': return handleLogin(req, res);
    case 'refresh': return handleRefresh(req, res);
    case 'me': return handleMe(req, res);
    default:
      res.status(404).json({ error: 'عملية غير معروفة.' });
  }
});
