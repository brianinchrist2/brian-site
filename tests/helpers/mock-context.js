import { createMockEnv } from './mock-env.js';

export function createMockContext(options = {}) {
  const {
    method = 'GET',
    url = 'http://localhost/api/test',
    headers = {},
    body = null,
    params = {},
    env = null,
  } = options;

  const requestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    requestInit.body = JSON.stringify(body);
  }

  const request = new Request(url, requestInit);
  const mockEnv = env || createMockEnv();

  return {
    request,
    env: mockEnv,
    params,
    waitUntil: (promise) => Promise.resolve(promise),
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    data: null,
  };
}
