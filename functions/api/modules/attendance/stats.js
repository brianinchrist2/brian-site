import { verifyAuth, requireRole, canManageClass, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne } from "../../../_shared/db.js";

// GET /api/modules/attendance/stats - 考勤统计
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);

    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const classId = url.searchParams.get("class_id");
    let studentId = url.searchParams.get("student_id");

    if (!classId) {
      return jsonError(400, "class_id is required");
    }

    const isStaff = requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok;
    if (isStaff) {
      if (!requireRole(auth.roles, ['admin']).ok && !(await canManageClass(env.DB, auth.payload.sub, classId))) {
        return jsonError(403, "You do not manage this class");
      }
    } else {
      // 学生只能查询自己的考勤
      studentId = auth.payload.sub;
      const member = await queryOne(env.DB,
        'SELECT 1 as x FROM class_members WHERE class_id = ? AND student_id = ?',
        [classId, auth.payload.sub]);
      if (!member) return jsonError(403, "You are not a member of this class");
    }

    // Total session count for this class
    const totalResult = await queryOne(env.DB, `
      SELECT COUNT(*) as count FROM class_sessions WHERE class_id = ?
    `, [classId]);
    const totalSessions = totalResult.count;

    if (totalSessions === 0) {
      return new Response(JSON.stringify({
        success: true,
        stats: { totalSessions: 0, students: [] }
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    let students;
    if (studentId) {
      // Stats for a single student
      students = await queryAll(env.DB, `
        SELECT
          u.id as student_id,
          u.nickname,
          u.email,
          COALESCE(SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END), 0) as present,
          COALESCE(SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END), 0) as absent,
          COALESCE(SUM(CASE WHEN ar.status = 'late' THEN 1 ELSE 0 END), 0) as late,
          COALESCE(SUM(CASE WHEN ar.status = 'excused' THEN 1 ELSE 0 END), 0) as excused,
          COUNT(ar.id) as total_recorded
        FROM class_members cm
        JOIN users u ON cm.student_id = u.id
        LEFT JOIN attendance_records ar ON ar.student_id = cm.student_id
          AND ar.class_session_id IN (SELECT id FROM class_sessions WHERE class_id = ?)
        WHERE cm.class_id = ? AND cm.student_id = ?
        GROUP BY u.id
      `, [classId, classId, studentId]);
    } else {
      // Stats for all students in the class
      students = await queryAll(env.DB, `
        SELECT
          u.id as student_id,
          u.nickname,
          u.email,
          COALESCE(SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END), 0) as present,
          COALESCE(SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END), 0) as absent,
          COALESCE(SUM(CASE WHEN ar.status = 'late' THEN 1 ELSE 0 END), 0) as late,
          COALESCE(SUM(CASE WHEN ar.status = 'excused' THEN 1 ELSE 0 END), 0) as excused,
          COUNT(ar.id) as total_recorded
        FROM class_members cm
        JOIN users u ON cm.student_id = u.id
        LEFT JOIN attendance_records ar ON ar.student_id = cm.student_id
          AND ar.class_session_id IN (SELECT id FROM class_sessions WHERE class_id = ?)
        WHERE cm.class_id = ?
        GROUP BY u.id
        ORDER BY u.nickname
      `, [classId, classId]);
    }

    // Calculate rates
    const studentsWithRate = students.map(s => ({
      ...s,
      present: Number(s.present),
      absent: Number(s.absent),
      late: Number(s.late),
      excused: Number(s.excused),
      total_recorded: Number(s.total_recorded),
      attendanceRate: totalSessions > 0
        ? Number(((Number(s.present) + Number(s.late)) / totalSessions).toFixed(2))
        : 0
    }));

    // Fetch session-level details for each student
    const studentsWithSessions = await Promise.all(
      studentsWithRate.map(async (s) => {
        const sessions = await queryAll(env.DB, `
          SELECT ar.status, ar.notes, cs.session_date, cs.title
          FROM attendance_records ar
          JOIN class_sessions cs ON ar.class_session_id = cs.id
          WHERE ar.student_id = ? AND cs.class_id = ?
          ORDER BY cs.session_date DESC
        `, [s.student_id, classId]);
        return { ...s, sessions };
      })
    );

    return new Response(JSON.stringify({
      success: true,
      stats: {
        totalSessions,
        students: studentsWithSessions
      }
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
