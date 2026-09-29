// api/backup/[action] — موجّه واحد للنسخ الاحتياطية: store | list | get

import { handler, routeParam } from '../_lib/http';
import { handleStore, handleList, handleGet } from '../_handlers/backup';

export default handler(async (req, res) => {
  const action = routeParam(req, 'action');
  switch (action) {
    case 'store': return handleStore(req, res);
    case 'list': return handleList(req, res);
    case 'get': return handleGet(req, res);
    default:
      res.status(404).json({ error: 'عملية غير معروفة.' });
  }
});
