import { verifyJWT } from "../../../../_utils/jwt.js";
import { queryOne, execute, generateId, now } from "../../../../_shared/db.js";

// PUT /api/modules/certificates/[id] - 审批证书（教师/管理员）
export async function onRequestPut(context) {
  try {
    const { env, params, request } = context;
    const certId = params.id;
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    // 检查权限
    const user = await queryOne(env.DB,
      'SELECT roles FROM users WHERE id = ?',
      [payload.sub]
    );
    const roles = JSON.parse(user.roles || '[]');
    if (!roles.includes('teacher') && !roles.includes('admin')) {
      return new Response(JSON.stringify({ error: "Teacher or admin access required" }), { status: 403 });
    }
    
    const { status: newStatus } = await request.json();
    
    if (!['approved', 'rejected'].includes(newStatus)) {
      return new Response(JSON.stringify({ error: "Invalid status" }), { status: 400 });
    }
    
    const cert = await queryOne(env.DB,
      'SELECT student_id, course_id FROM certificates WHERE id = ?',
      [certId]
    );
    
    if (!cert) {
      return new Response(JSON.stringify({ error: "Certificate not found" }), { status: 404 });
    }
    
    const reviewedAt = now();
    const issuedAt = newStatus === 'approved' ? reviewedAt : null;
    
    await execute(env.DB, `
      UPDATE certificates 
      SET status = ?, teacher_id = ?, reviewed_at = ?, issued_at = ?
      WHERE id = ?
    `, [newStatus, payload.sub, reviewedAt, issuedAt, certId]);
    
    // 创建通知
    const title = newStatus === 'approved' 
      ? '恭喜！您的结业申请已批准' 
      : '您的结业申请未通过';
    
    await execute(env.DB, `
      INSERT INTO notifications (id, user_id, type, title, content, entity_type, entity_id, created_at)
      VALUES (?, ?, 'certificate_reviewed', ?, ?, 'certificate', ?, ?)
    `, [generateId(), cert.student_id, title, null, certId, reviewedAt]);
    
    return new Response(JSON.stringify({
      success: true,
      message: `Certificate ${newStatus}`
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
