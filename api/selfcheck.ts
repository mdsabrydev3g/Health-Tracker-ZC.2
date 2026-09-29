// api/selfcheck.ts — تشخيص: دالة تستورد من _lib فقط (بلا أي حزمة خارجية).
// تنجح → المشكلة في حزمة خارجية؛ تنهر → المشكلة في تضمين ملفات _lib.
import { handler, json } from './_lib/http';

export default handler(async (req, res) => {
  json(req, res, 200, { ok: true, src: 'selfcheck: _lib imports OK' });
});
