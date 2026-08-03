import { verifyAuth, requireRole, jsonError } from "../../../../_utils/requireAuth.js";
import { queryOne, execute, now } from "../../../../_shared/db.js";
import { rateLimit } from "../../../../_utils/rate-limit.js";

// POST /api/modules/certificates/:id/reject - 拒绝证书
export async function onRequestPost(context) {
  try {
    const { env, params, request } = context;
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok) return jsonError(403, "Forbidden");
    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }

    const cert = await queryOne(env.DB, 'SELECT * FROM certificates WHERE id = ?', [params.id]);
    if (!cert) return jsonError(404, "Certificate not found");
    if (cert.status !== 'pending') return jsonError(400, "Only pending certificates can be rejected");

    await execute(env.DB, "UPDATE certificates SET status = 'rejected', reviewed_at = ? WHERE id = ?",
      [now(), params.id]);
    return new Response(JSON.stringify({ success: true, status: 'rejected' }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return jsonError(500, "Internal server error");
  }
}
