import { verifyAuth, requireRole, canManageCourse, jsonError } from "../../../../_utils/requireAuth.js";
import { queryOne, execute, now } from "../../../../_shared/db.js";
import { rateLimit } from "../../../../_utils/rate-limit.js";

// POST /api/modules/certificates/:id/approve - 批准证书
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

    // 非 admin 员工须能管理该证书所属课程（自建 ∪ 所顾问班级课程，与列表接口的课程范围一致）
    if (!auth.roles.includes('admin')) {
      const manages = await canManageCourse(env.DB, auth.payload.sub, cert.course_id);
      const advisesClass = await queryOne(env.DB,
        `SELECT cc.course_id FROM class_courses cc JOIN classes cl ON cl.id = cc.class_id WHERE cc.course_id = ? AND cl.advisor_id = ?`,
        [cert.course_id, auth.payload.sub]);
      if (!manages && !advisesClass) {
        return jsonError(403, "You do not manage this course");
      }
    }

    if (cert.status !== 'pending') return jsonError(400, "Only pending certificates can be approved");

    // 要求通过最终成绩（git log: fix(certificates) 已要求 passing final grade）
    const grade = await queryOne(env.DB,
      "SELECT letter_grade FROM final_grades WHERE student_id = ? AND course_id = ?",
      [cert.student_id, cert.course_id]);
    if (!grade || grade.letter_grade === 'F') {
      return jsonError(400, "Student has no passing final grade");
    }

    await execute(env.DB, "UPDATE certificates SET status = 'approved', reviewed_at = ? WHERE id = ?",
      [now(), params.id]);
    return new Response(JSON.stringify({ success: true, status: 'approved' }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return jsonError(500, "Internal server error");
  }
}
