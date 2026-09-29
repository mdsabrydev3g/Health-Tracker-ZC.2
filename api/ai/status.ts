// GET /api/ai/status — المزودون المتاحون (بلا مفاتيح)

import { handler, json } from '../_lib/http';
import { providersStatus } from '../_lib/aiProviders';

export default handler(async (req) => {
  const providers = providersStatus();
  return json(req, 200, { providers, any: providers.some((p) => p.available) });
});
