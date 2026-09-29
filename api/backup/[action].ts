// api/backup/[action] — موجّه واحد للنسخ الاحتياطية: store | list | get

import { handler, routeParams } from '../_lib/http';
import { handleStore, handleList, handleGet } from '../_handlers/backup';

export default handler(async (req, ctx) => {
  const { action } = await routeParams(ctx);
  switch (action) {
    case 'store': return handleStore(req);
    case 'list': return handleList(req);
    case 'get': return handleGet(req);
    default:
      return Response.json({ error: 'عملية غير معروفة.' }, { status: 404 });
  }
});
