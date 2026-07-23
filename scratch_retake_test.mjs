/**
 * Playwright 测试：学生考核页面的重考 UI
 *
 * 使用 API 路由拦截模拟后端响应，验证：
 * - 无提交 → "开始考试"
 * - in_progress → "继续考试"
 * - graded → 显示分数 + "重考"
 *
 * 运行：node scratch_retake_test.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const STATIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'course-app');
const PORT = 8899;
const MIME = {
  '.html': 'text/html;charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/** 模拟的考核数据 */
const MOCK_ASSESSMENTS = [
  {
    id: 'exam-1',
    course_id: 'course-1',
    title: '第一次测验',
    type: 'quiz',
    total_score: 100,
    passing_score: 60,
    duration_minutes: 30,
    status: 'published',
    submission: null, // 未考
  },
  {
    id: 'exam-2',
    course_id: 'course-1',
    title: '期中考试',
    type: 'quiz',
    total_score: 100,
    passing_score: 60,
    duration_minutes: 60,
    status: 'published',
    submission: {
      id: 'sub-2',
      status: 'graded',
      total_score: 85,
      attempt_number: 1,
      started_at: '2026-07-01T10:00:00Z',
      submitted_at: '2026-07-01T11:00:00Z',
    }, // 已考 85分
  },
  {
    id: 'exam-3',
    course_id: 'course-1',
    title: '期末考试',
    type: 'quiz',
    total_score: 100,
    passing_score: 60,
    duration_minutes: 90,
    status: 'published',
    submission: {
      id: 'sub-3',
      status: 'in_progress',
      total_score: null,
      attempt_number: 2,
      started_at: '2026-07-22T08:00:00Z',
      submitted_at: null,
    }, // 进行中（第2次）
  },
  {
    id: 'exam-4',
    course_id: 'course-1',
    title: '随堂测试',
    type: 'quiz',
    total_score: 50,
    passing_score: 30,
    duration_minutes: 15,
    status: 'published',
    submission: {
      id: 'sub-4',
      status: 'submitted',
      total_score: null,
      attempt_number: 1,
      started_at: '2026-07-20T14:00:00Z',
      submitted_at: '2026-07-20T14:15:00Z',
    }, // 已提交待评分
  },
];

// 启动静态文件服务
function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      console.log('  [REQ]', req.method, req.url);
      // API 路由拦截 — 返回模拟数据
      if (req.url.startsWith('/api/modules/assessments') && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, assessments: MOCK_ASSESSMENTS, pagination: { total: 4, limit: 20, offset: 0, hasMore: false } }));
        return;
      }
      if (req.url.startsWith('/api/') && req.url.includes('/start') && req.method === 'POST') {
        // 模拟开始考试
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, submission_id: 'mock-sub-' + Date.now(), attempt_number: 1, questions: [] }));
        return;
      }
      // 其他 API → 401
      if (req.url.startsWith('/api/')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      // 静态文件
      const urlPath = req.url.split('?')[0];
      let filePath = join(STATIC_DIR, urlPath === '/' ? 'index.html' : urlPath.substring(1));
      console.log('    →', filePath, existsSync(filePath) ? 'EXISTS' : 'MISSING');
      if (!existsSync(filePath)) {
        // try common paths
        const altPaths = [
          join(STATIC_DIR, 'course-app', urlPath.substring(1)),
          join(STATIC_DIR, '..', 'brianinchrist', urlPath.substring(1)),
          join(STATIC_DIR, 'student', 'assessments.html'),
        ];
        for (const alt of altPaths) {
          if (existsSync(alt)) { filePath = alt; break; }
        }
      }
      const ext = extname(filePath);
      const mime = MIME[ext] || 'application/octet-stream';
      try {
        const content = readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function run() {
  const server = await startServer();
  console.log(`Server running on http://localhost:${PORT}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  let passed = 0;
  let failed = 0;

  async function assert(description, fn) {
    try {
      await fn();
      console.log(`  ✓ ${description}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${description}`);
      console.log(`    ${err.message}`);
      failed++;
    }
  }

  try {
    // 在页面脚本执行前注入 token
    await page.addInitScript(() => {
      localStorage.setItem('auth_token', 'mock-test-token');
      localStorage.setItem('auth_user', JSON.stringify({ id: 'test-user', nickname: 'Test', email: 'test@test.com', roles: ['student'] }));
    });

    // 捕获 console 和 page 错误
    page.on('console', msg => { if (msg.type() === 'error') console.log('  [PAGE ERROR]', msg.text()); });
    page.on('pageerror', err => console.log('  [PAGE CRASH]', err.message));

    await page.goto(`http://localhost:${PORT}/student/assessments.html`, { waitUntil: 'load', timeout: 10000 });
    await page.waitForTimeout(2000);

    // 截图调试
    await page.screenshot({ path: 'test-results/retake-ui-debug.png', fullPage: true });

    console.log('  Page title:', await page.title());
    console.log('  Page URL:', page.url());
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 300) || 'NO BODY');
    console.log('  Body text:', bodyText);

    await page.waitForSelector('.card', { timeout: 5000 });

    // 获取所有考核卡片
    const cards = page.locator('.card');
    const count = await cards.count();
    console.log(`\nFound ${count} assessment cards\n`);

    // Test 1: 未考 → "开始考试"
    await assert('Unattempted exam shows "开始考试"', async () => {
      const firstCard = cards.nth(0);
      await expect(firstCard.locator('h3')).toHaveText('第一次测验');
      await expect(firstCard.locator('.btn')).toHaveText('开始考试');
    });

    // Test 2: 已评分 → "重考" + 显示分数
    await assert('Graded exam shows score and "重考"', async () => {
      const secondCard = cards.nth(1);
      await expect(secondCard.locator('h3')).toHaveText('期中考试');
      // 检查分数显示
      const scoreText = await secondCard.locator('div').filter({ hasText: /得分/ }).textContent();
      if (!scoreText.includes('85')) throw new Error(`Expected score 85, got: ${scoreText}`);
      if (!scoreText.includes('1')) throw new Error(`Expected attempt 1, got: ${scoreText}`);
      await expect(secondCard.locator('.btn')).toHaveText('重考');
    });

    // Test 3: 进行中 → "继续考试"
    await assert('In-progress exam shows "继续考试"', async () => {
      const thirdCard = cards.nth(2);
      await expect(thirdCard.locator('h3')).toHaveText('期末考试');
      await expect(thirdCard.locator('.btn')).toHaveText('继续考试');
    });

    // Test 4: 已提交 → "重考"
    await assert('Submitted exam shows "重考"', async () => {
      const fourthCard = cards.nth(3);
      await expect(fourthCard.locator('h3')).toHaveText('随堂测试');
      await expect(fourthCard.locator('.btn')).toHaveText('重考');
    });

    // 截屏保存
    await page.screenshot({ path: 'test-results/retake-ui.png', fullPage: true });
    console.log('\nScreenshot saved to test-results/retake-ui.png');

  } catch (err) {
    console.error('Test error:', err.message);
    failed++;
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

// 简易 expect（不依赖 @playwright/test）
function expect(locator) {
  return {
    toHaveText: async (expected) => {
      const text = await locator.textContent();
      if (!text.includes(expected)) {
        throw new Error(`Expected "${expected}" in "${text}"`);
      }
    },
    toBeVisible: async () => {
      if (!await locator.isVisible()) {
        throw new Error('Element not visible');
      }
    },
  };
}

run();
