import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';

// 用户决定移除独立静态课件页面（index/chapter/review/print.html 及其 JS），
// 保留 courseware.json 作为阅读器内嵌面板的数据源。此测试守护该决定，防误恢复/误删。
const CW_DIR = join(process.cwd(), 'brianinchrist/organicchurch/library/lordship_gospel/courseware');

describe('standalone courseware static pages removed (user decision)', () => {
  it('removed the standalone courseware HTML pages', () => {
    for (const f of ['index.html', 'chapter.html', 'review.html', 'print.html']) {
      expect(existsSync(join(CW_DIR, f)), `${f} should be removed`).toBe(false);
    }
  });

  it('kept the courseware.json data consumed by the reader panel', () => {
    expect(existsSync(join(CW_DIR, 'assets/data/courseware.json'))).toBe(true);
  });
});
