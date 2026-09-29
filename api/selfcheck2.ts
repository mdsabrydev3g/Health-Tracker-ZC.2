// api/selfcheck2.ts — تشخيص: استيراد من خارج api/ (server/pinglib) — بلا بادئة _
import { handler, json } from './_lib/http';
import { pongPayload } from '../server/pinglib';

export default handler(async (req, res) => {
  json(req, res, 200, pongPayload());
});
