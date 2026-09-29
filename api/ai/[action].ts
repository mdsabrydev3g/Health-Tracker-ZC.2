// api/ai/[action] — موجّه واحد لعمليات AI: status | run | summarize | chat

import { handler, routeParams } from '../_lib/http';
import { handleStatus, handleRun } from '../_handlers/ai';

export default handler(async (req, ctx) => {
  const { action } = await routeParams(ctx);
  switch (action) {
    case 'status': return handleStatus(req);
    case 'run':
    case 'summarize':
    case 'chat': // العنوانان قسمان لغوياً — نفس المعالج والقدرة تأتي في الطلب
      return handleRun(req);
    default:
      return Response.json({ error: 'عملية غير معروفة.' }, { status: 404 });
  }
});
