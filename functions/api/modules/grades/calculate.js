import { verifyAuth, requireRole, canManageCourse, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne, batch, generateId, now } from "../../../_shared/db.js";
import { rateLimit } from "../../../_utils/rate-limit.js";

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['teacher', 'admin']).ok) return jsonError(403, "Forbidden");
    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }
    const url = new URL(request.url);
    const courseId = url.searchParams.get("course_id");
    if (!courseId) return new Response(JSON.stringify({ error: "course_id is required" }), { status: 400 });
    if (!auth.roles.includes('admin') && !(await canManageCourse(env.DB, auth.payload.sub, courseId))) return jsonError(403, "Forbidden");
    const components = await queryAll(env.DB, "SELECT * FROM grade_components WHERE course_id = ?", [courseId]);
    if (components.length === 0) return new Response(JSON.stringify({ error: "No grade components configured" }), { status: 400 });
    const students = await queryAll(env.DB, "SELECT u.id FROM class_members cm JOIN users u ON cm.student_id = u.id JOIN class_courses cc ON cm.class_id = cc.class_id WHERE cc.course_id = ?", [courseId]);
    const statements = [];
    for (const student of students) {
      let totalScore = 0;
      const breakdown = [];
      for (const comp of components) {
        let compScore = 0;
        if (comp.component_type === 'assignment') {
          const subs = await queryAll(env.DB, "SELECT AVG(g.score / a.max_score) as avg FROM assignment_submissions s JOIN assignment_grades g ON s.id = g.submission_id JOIN assignments a ON s.assignment_id = a.id WHERE s.student_id = ? AND a.course_id = ?", [student.id, courseId]);
          compScore = subs[0] && subs[0].avg ? subs[0].avg * 100 : 0;
        } else if (comp.component_type === 'assessment') {
          const subs = await queryAll(env.DB, "SELECT AVG(total_score / (SELECT total_score FROM assessments WHERE id = assessment_submissions.assessment_id)) as avg FROM assessment_submissions WHERE student_id = ? AND assessment_id IN (SELECT id FROM assessments WHERE course_id = ?)", [student.id, courseId]);
          compScore = subs[0] && subs[0].avg ? subs[0].avg * 100 : 0;
        } else if (comp.component_type === 'attendance') {
          const total = await queryOne(env.DB, "SELECT COUNT(*) as count FROM class_sessions cs JOIN class_courses cc ON cs.class_id = cc.class_id WHERE cc.course_id = ?", [courseId]);
          const present = await queryOne(env.DB, "SELECT COUNT(*) as count FROM attendance_records ar WHERE ar.student_id = ? AND ar.status IN ('present','late')", [student.id]);
          compScore = total && total.count > 0 ? (present.count / total.count) * 100 : 0;
        }
        totalScore += compScore * (comp.weight / 100);
        breakdown.push({ component: comp.name, type: comp.component_type, weight: comp.weight, score: compScore });
      }
      let letter = 'F';
      if (totalScore >= 90) letter = 'A';
      else if (totalScore >= 80) letter = 'B';
      else if (totalScore >= 70) letter = 'C';
      else if (totalScore >= 60) letter = 'D';
      const existing = await queryOne(env.DB, "SELECT id FROM final_grades WHERE student_id = ? AND course_id = ?", [student.id, courseId]);
      if (existing) {
        statements.push({ sql: "UPDATE final_grades SET total_score = ?, letter_grade = ?, breakdown = ?, status = 'calculated', updated_at = ? WHERE id = ?", params: [totalScore, letter, JSON.stringify(breakdown), now(), existing.id] });
      } else {
        const id = generateId();
        statements.push({ sql: "INSERT INTO final_grades (id, student_id, course_id, total_score, letter_grade, breakdown, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')", params: [id, student.id, courseId, totalScore, letter, JSON.stringify(breakdown)] });
      }
    }
    if (statements.length > 0) {
      await batch(env.DB, statements);
    }
    return new Response(JSON.stringify({ success: true, calculated: students.length }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
