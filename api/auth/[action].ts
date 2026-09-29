// api/auth/[action] — موجّه واحد لكل عمليات المصادقة:
// register | join | login | refresh | me
// (خطة Vercel Hobby تسمح بـ12 دالة كحد أقصى للنشر — الدمج يخفض العدد الكلي).

import { handler, routeParams } from '../_lib/http';
import { requireAuth } from '../_lib/auth';
import {
  handleRegister, handleJoin, handleLogin, handleRefresh, handleMe,
} from '../_handlers/auth';

export default handler(async (req, ctx) => {
  const { action } = await routeParams(ctx);
  switch (action) {
    case 'register': return handleRegister(req);
    case 'join': return handleJoin(req);
    case 'login': return handleLogin(req);
    case 'refresh': return handleRefresh(req);
    case 'me':
      // التحقق من الهوية ثم تمرير الطلب الأصلي (handleMe يقرأ Bearer بنفسه)
      await requireAuth(req);
      return handleMe(req);
    default:
      return Response.json({ error: 'عملية غير معروفة.' }, { status: 404 });
  }
});
