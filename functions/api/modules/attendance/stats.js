import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne } from "../../../_shared/db.js";

// GET /api/modules/attendance/stats - 考勤统计
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);

    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }

    const classId = url.searchParams.get("class_id");
    const studentId = url.searchParams.get("student_id");

    if (!classId) {
      return new Response(JSON.stringify({ error: "class_id is required" }), { status: 400 });
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
