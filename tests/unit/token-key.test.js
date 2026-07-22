import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

function findTokenUsage(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTokenUsage(fullPath));
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.html')) {
      const content = readFileSync(fullPath, 'utf-8');
      const pattern = /localStorage\.(get|set|remove)Item\(['"]token['"]\)/g;
      const matches = content.match(pattern);
      if (matches) results.push({ file: fullPath, count: matches.length });
    }
  }
  return results;
}

describe('token storage key consistency', () => {
  it('no file uses localStorage with "token" key (should use "auth_token")', () => {
    const results = findTokenUsage('course-app');
    expect(results).toEqual([]);
  });
});
