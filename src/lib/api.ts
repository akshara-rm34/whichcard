import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SpendCategory } from './categories';

/**
 * Client for the WhichCard backend.
 *
 * The session token lives in AsyncStorage and is cached in memory so that the common
 * case — attaching it to a request — doesn't hit storage every time.
 */

export const API_BASE = 'https://whichcard-api.vercel.app';

const TOKEN_KEY = 'whichcard.token';
const REQUEST_TIMEOUT_MS = 15_000;

let cachedToken: string | null | undefined;

export async function getToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  return cachedToken;
}

async function setToken(token: string | null): Promise<void> {
  cachedToken = token;
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = 'GET', body, auth = false } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await getToken();
    if (!token) throw new ApiError('Not signed in.', 401);
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError('The server took too long to respond.', 0);
    }
    throw new ApiError('Could not reach the server.', 0);
  } finally {
    clearTimeout(timeout);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(`Server returned ${response.status}.`, response.status);
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Server returned ${response.status}.`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

/* ---------- auth ---------- */

export async function signUp(email: string, password: string): Promise<void> {
  const { token } = await request<{ token: string }>('/api/auth/signup', {
    method: 'POST',
    body: { email, password },
  });
  await setToken(token);
}

export async function signIn(email: string, password: string): Promise<void> {
  const { token } = await request<{ token: string }>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  await setToken(token);
}

export async function signOut(): Promise<void> {
  await setToken(null);
}

/* ---------- wallet ---------- */

export async function fetchWallet(): Promise<string[]> {
  const { cards } = await request<{ cards: string[] }>('/api/wallet', { auth: true });
  return cards;
}

export async function saveWallet(cards: string[]): Promise<void> {
  await request('/api/wallet', { method: 'PUT', body: { cards }, auth: true });
}

/* ---------- corrections ---------- */

export type CorrectionResult = {
  osmId: string;
  category: SpendCategory | null;
  votes: number;
  total: number;
};

export async function fetchCorrection(osmId: string): Promise<CorrectionResult> {
  return request<CorrectionResult>(
    `/api/corrections?osmId=${encodeURIComponent(osmId)}`,
  );
}

export async function submitCorrection(
  osmId: string,
  category: SpendCategory,
): Promise<void> {
  await request('/api/corrections', {
    method: 'POST',
    body: { osmId, category },
    auth: true,
  });
}

/* ---------- analytics ---------- */

/**
 * Records a usage event. Deliberately fire-and-forget: analytics must never break or
 * slow down the thing the user actually asked for.
 */
export function logEvent(event: {
  eventType: string;
  osmId?: string;
  category?: string | null;
  cardKey?: string;
}): void {
  void (async () => {
    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      await fetch(`${API_BASE}/api/events`, {
        method: 'POST',
        headers,
        body: JSON.stringify(event),
      });
    } catch {
      // Swallowed on purpose — a failed analytics ping is not the user's problem.
    }
  })();
}
