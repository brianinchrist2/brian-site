/**
 * D1 数据库查询辅助模块
 */

/**
 * 执行查询并返回所有结果
 * @param {D1Database} db - D1 数据库实例
 * @param {string} sql - SQL 查询语句
 * @param {any[]} params - 查询参数
 * @returns {Promise<any[]>}
 */
export async function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  const bound = params.length > 0 ? stmt.bind(...params) : stmt;
  const { results } = await bound.all();
  return results || [];
}

/**
 * 执行查询并返回单条结果
 * @param {D1Database} db
 * @param {string} sql
 * @param {any[]} params
 * @returns {Promise<any|null>}
 */
export async function queryOne(db, sql, params = []) {
  const stmt = db.prepare(sql);
  const bound = params.length > 0 ? stmt.bind(...params) : stmt;
  const result = await bound.first();
  return result || null;
}

/**
 * 执行写操作（INSERT/UPDATE/DELETE）
 * @param {D1Database} db
 * @param {string} sql
 * @param {any[]} params
 * @returns {Promise<D1Result>}
 */
export async function execute(db, sql, params = []) {
  const stmt = db.prepare(sql);
  const bound = params.length > 0 ? stmt.bind(...params) : stmt;
  return await bound.run();
}

/**
 * 批量执行写操作（事务）
 * @param {D1Database} db
 * @param {Array<{sql: string, params: any[]}>} statements
 * @returns {Promise<D1Result[]>}
 */
export async function batch(db, statements) {
  const stmts = statements.map(({ sql, params }) => {
    const stmt = db.prepare(sql);
    return params.length > 0 ? stmt.bind(...params) : stmt;
  });
  return await db.batch(stmts);
}

/**
 * 生成 UUID
 * @returns {string}
 */
export function generateId() {
  return crypto.randomUUID();
}

/**
 * 获取当前时间戳（ISO 格式）
 * @returns {string}
 */
export function now() {
  return new Date().toISOString();
}
