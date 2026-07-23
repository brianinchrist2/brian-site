export async function onRequestGet(context) {
  const { env } = context;
  const checks = { status: "ok", timestamp: new Date().toISOString() };

  try {
    if (env.DB) {
      await env.DB.prepare("SELECT 1").first();
      checks.db = "connected";
    } else {
      checks.db = "missing";
      checks.status = "degraded";
    }
  } catch (e) {
    checks.db = "error";
    checks.status = "degraded";
  }

  try {
    if (env.USERS_KV) {
      await env.USERS_KV.list({ limit: 1 });
      checks.kv = "connected";
    } else {
      checks.kv = "missing";
      checks.status = "degraded";
    }
  } catch (e) {
    checks.kv = "error";
    checks.status = "degraded";
  }

  const status = checks.status === "ok" ? 200 : 503;
  return new Response(JSON.stringify(checks), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
