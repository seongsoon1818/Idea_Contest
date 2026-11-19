// API client (same behaviour as frontend2/dist/account-api.js).
// Access tokens stay in memory; the server keeps the refresh token in an HttpOnly cookie.
const COOKIE_LOCK = 'hsupick:account-cookie';
const REFRESH_RETRY_DELAYS = [150, 400, 850];

export interface ApiUser { id: string; name: string; loginId?: string; email?: string | null }
export interface ApiError extends Error { status?: number; code?: string; fields?: unknown }
type Options = { method?: string; body?: unknown };

export function createAccountApi(onSessionLost: () => void = () => {}) {
  let accessToken: string | null = null;
  let userId: string | null = null;
  let pendingRestore: Promise<ApiUser> | null = null;
  let pendingRefresh: Promise<void> | null = null;
  let generation = 0;

  // The refresh cookie is shared across tabs; hold a lock until Set-Cookie arrives.
  async function withCookieLock<T>(operation: (locked: boolean) => Promise<T>): Promise<T> {
    const locks = globalThis.navigator?.locks;
    if (typeof locks?.request !== 'function') return operation(false);
    let started = false;
    try {
      return await locks.request(COOKIE_LOCK, () => { started = true; return operation(true); });
    } catch (error) {
      if (started) throw error;
      return operation(false);
    }
  }

  async function request<T = any>(path: string, { method = 'GET', body, token }: Options & { token?: string | null } = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (method !== 'GET') headers['X-CSRF-Guard'] = '1';
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    let response: Response;
    let result: any;
    try {
      response = await fetch('/api/v1' + path, {
        method, headers, credentials: 'same-origin', redirect: 'error', cache: 'no-store',
        signal: AbortSignal.timeout(10000),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      result = await response.json();
    } catch {
      throw new Error('서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.');
    }
    if (!response.ok || result?.success !== true || !result.data) {
      throw Object.assign(new Error(result?.error?.message || '계정 요청을 처리하지 못했어요.'), {
        status: response.status, code: result?.error?.code, fields: result?.error?.fieldErrors,
      });
    }
    return result.data as T;
  }

  function verifySession(data: any): ApiUser {
    if (typeof data.accessToken !== 'string' || !data.accessToken || typeof data.user?.id !== 'string' || !data.user.id) {
      throw new Error('서버의 계정 정보를 확인할 수 없어요.');
    }
    accessToken = data.accessToken;
    userId = data.user.id;
    generation++;
    return data.user;
  }

  async function refresh(locked: boolean): Promise<any> {
    for (let attempt = 0; ; attempt++) {
      try { return await request('/auth/refresh', { method: 'POST' }); }
      catch (error: any) {
        // Another tab may still be rotating the cookie; retry with the browser's cookie only.
        if (locked || attempt >= REFRESH_RETRY_DELAYS.length || error.status !== 401 || error.code !== 'INVALID_REFRESH_TOKEN') throw error;
        await new Promise((resolve) => setTimeout(resolve, REFRESH_RETRY_DELAYS[attempt]));
      }
    }
  }

  function clear() { accessToken = null; userId = null; generation++; }
  function sessionLost(error: ApiError, epoch: number) {
    if (epoch === generation && userId && ['INVALID_REFRESH_TOKEN', 'SESSION_REVOKED', 'ACCOUNT_DISABLED', 'INVALID_TOKEN', 'ACCOUNT_CHANGED'].includes(error.code || '')) {
      clear();
      onSessionLost();
    }
  }

  async function call<T = any>(path: string, options: Options = {}): Promise<T> {
    const token = accessToken, owner = userId, epoch = generation;
    try {
      const data = await request<T>(path, { ...options, token });
      if (epoch !== generation) throw new Error('계정이 변경됐습니다. 다시 시도해 주세요.');
      return data;
    } catch (error: any) {
      if (!owner || epoch !== generation || error.code !== 'ACCESS_TOKEN_EXPIRED') { sessionLost(error, epoch); throw error; }
      if (token === accessToken) {
        pendingRefresh ??= withCookieLock(async (locked) => {
          const next = await refresh(locked);
          const user = await request<ApiUser>('/users/me', { token: next.accessToken });
          if (epoch !== generation || user.id !== owner) throw Object.assign(new Error('로그인 계정이 변경됐습니다. 다시 로그인해 주세요.'), { code: 'ACCOUNT_CHANGED' });
          accessToken = next.accessToken;
        }).finally(() => { pendingRefresh = null; });
        try { await pendingRefresh; } catch (e: any) { sessionLost(e, epoch); throw e; }
      }
      if (epoch !== generation) throw error;
      const data = await request<T>(path, { ...options, token: accessToken });
      if (epoch !== generation) throw error;
      return data;
    }
  }

  return {
    call, clear,
    authenticate(kind: 'login' | 'signup', input: unknown) {
      return withCookieLock(async () => verifySession(await request('/auth/' + kind, { method: 'POST', body: input })));
    },
    restore() {
      if (!pendingRestore) {
        pendingRestore = withCookieLock(async (locked) => {
          const tokens = await refresh(locked);
          if (typeof tokens.accessToken !== 'string' || !tokens.accessToken) throw new Error('로그인 정보를 확인할 수 없어요.');
          const user = await request<ApiUser>('/users/me', { token: tokens.accessToken });
          return verifySession({ ...tokens, user });
        }).finally(() => { pendingRestore = null; });
      }
      return pendingRestore;
    },
    logout() {
      return withCookieLock(async () => {
        const data = await request<{ loggedOut: boolean }>('/auth/logout', { method: 'POST' });
        if (data.loggedOut !== true) throw new Error('로그아웃을 완료하지 못했어요.');
        clear();
      });
    },
  };
}

export const campusApi = createAccountApi(() => window.dispatchEvent(new Event('hsu-session-expired')));
