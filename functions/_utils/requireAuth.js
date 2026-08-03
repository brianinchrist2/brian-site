import { verifyJWT } from "./jwt.js";
import { queryOne } from "../_shared/db.js";
export { clampLimit, clampOffset } from "./params.js";

export async function getRoles(db, userId) {
  try {
    const user = await queryOne(db, "SELECT roles FROM users WHERE id = ?", [userId]);
    if (!user || !user.roles) return [];
    const parsed = JSON.parse(user.roles);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function verifyAuth(db, request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Unauthorized", payload: null, roles: [] };
  }
  const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
  if (!payload) {
    return { ok: false, status: 401, error: "Invalid token", payload: null, roles: [] };
  }
  const roles = await getRoles(db, payload.sub);
  return { ok: true, status: 200, error: null, payload, roles };
}

export function requireRole(roles, allowed) {
  if (!allowed.some((r) => roles.includes(r))) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true };
}

export async function isEnrolled(db, studentId, courseId) {
  const row = await queryOne(
    db,
    "SELECT id FROM enrollments WHERE student_id = ? AND course_id = ? AND status = 'active'",
    [studentId, courseId]
  );
  return !!row;
}

export async function canManageCourse(db, teacherId, courseId) {
  const row = await queryOne(db, "SELECT id FROM courses WHERE id = ? AND created_by = ?", [courseId, teacherId]);
  return !!row;
}

export async function canManageClass(db, teacherId, classId) {
  const row = await queryOne(db, "SELECT id FROM classes WHERE id = ? AND advisor_id = ?", [classId, teacherId]);
  return !!row;
}

export function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
