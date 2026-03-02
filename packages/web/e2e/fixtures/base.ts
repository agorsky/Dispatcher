import { test as base, request, type APIRequestContext } from '@playwright/test';

const BASE_API_URL = process.env.E2E_API_URL || 'http://127.0.0.1:3001';
const TOKEN = process.env.E2E_TOKEN || 'st_wShsQaYUgKEL9uJosNtLlLx2bqQe0t5tVCN9DxYWIVA';
const TEAM_ID = '721bd403-ff7e-4a66-824c-f72d57bf9c02';

/** Retry an async operation up to `maxAttempts` times on network errors. */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, delayMs = 500): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ECONNREFUSED') || msg.includes('hang up') || msg.includes('ECONNRESET')) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export interface TestFixtures {
  apiContext: APIRequestContext;
  createTestEpic: () => Promise<string>;
  cleanupEpic: (id: string) => Promise<void>;
}

export const test = base.extend<TestFixtures>({
  apiContext: async ({}, use) => {
    const ctx = await request.newContext({
      baseURL: BASE_API_URL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    await use(ctx);
    await ctx.dispose();
  },

  createTestEpic: async ({ apiContext }, use) => {
    const fn = async (): Promise<string> => {
      return withRetry(async () => {
        const resp = await apiContext.post('/api/v1/epics', {
          data: {
            name: `E2E Test Epic ${Date.now()}`,
            teamId: TEAM_ID,
          },
        });
        const body = await resp.json();
        return body.data.id as string;
      });
    };
    await use(fn);
  },

  cleanupEpic: async ({ apiContext }, use) => {
    const fn = async (id: string): Promise<void> => {
      // End any active session first
      try {
        await apiContext.post(`/api/v1/sessions/${id}/end`, {
          data: { summary: 'E2E test cleanup' },
        });
      } catch {
        // Ignore if no active session
      }
      await apiContext.delete(`/api/v1/epics/${id}`);
    };
    await use(fn);
  },
});

export { expect } from '@playwright/test';
export { BASE_API_URL, TOKEN };
