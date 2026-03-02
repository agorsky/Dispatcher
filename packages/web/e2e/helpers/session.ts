import type { APIRequestContext } from '@playwright/test';

/**
 * Start a test session for an epic.
 * Returns the session ID.
 */
export async function startTestSession(
  apiContext: APIRequestContext,
  epicId: string,
  externalId?: string
): Promise<string> {
  const resp = await apiContext.post('/api/v1/sessions/start', {
    data: {
      epicId,
      ...(externalId ? { externalId } : {}),
    },
  });
  const body = await resp.json();
  return body.data.session.id as string;
}

/**
 * End a test session for an epic.
 */
export async function endTestSession(
  apiContext: APIRequestContext,
  epicId: string,
  summary = 'E2E test session ended'
): Promise<void> {
  try {
    await apiContext.post(`/api/v1/sessions/${epicId}/end`, {
      data: { summary },
    });
  } catch {
    // Ignore errors on cleanup
  }
}

/**
 * Emit a session event via the API.
 */
export async function emitSessionEvent(
  apiContext: APIRequestContext,
  event: {
    epicId: string;
    sessionId: string;
    eventType: string;
    payload?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await apiContext.post('/api/v1/sessions/emit-event', {
    data: {
      ...event,
      timestamp: new Date().toISOString(),
    },
  });
}
