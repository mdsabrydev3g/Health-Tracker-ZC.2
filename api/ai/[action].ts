// api/ai/[action] — موجّه واحد لعمليات AI: status | run | summarize | chat

import { handler, routeParam } from '../_lib/http';
import { handleStatus, handleRun } from '../_handlers/ai';

export default handler(async (req, res) => {
  const action = routeParam(req, 'action');
  switch (action) {
    case 'status': return handleStatus(req, res);
    case 'run':
    case 'summarize':
    case 'chat': // العنوانان قسمان لغوياً — نفس المعالج والقدرة تأتي في الطلب
      return handleRun(req, res);
    default:
      res.status(404).json({ error: 'عملية غير معروفة.' });
  }
});
