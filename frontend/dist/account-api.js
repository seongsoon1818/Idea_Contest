// The API shares the page's origin. Access tokens stay in memory; the server
// keeps the refresh token in an HttpOnly cookie.
const COOKIE_LOCK = 'hsupick:account-cookie';
const REFRESH_RETRY_DELAYS = [150, 400, 850];
export function createAccountApi(fetcher = (...args) => fetch(...args), locks = globalThis.navigator?.locks) {
 let accessToken = null, pendingRestore = null;
 // The refresh cookie is shared across tabs. Hold the lock until the browser
 // receives Set-Cookie, so the next request uses the new cookie.
 async function withCookieLock(operation) {
  if (typeof locks?.request !== 'function') return operation(false);
  let started = false;
  try {
   return await locks.request(COOKIE_LOCK, () => {
    started = true;
    return operation(true);
   });
  } catch (error) {
   if (started) throw error;
   return operation(false);
  }
 }
 async function request(path, {method = 'GET', body, token} = {}) {
  const headers = {Accept: 'application/json'};
  if (method !== 'GET') headers['X-CSRF-Guard'] = '1';
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  let response, result;
  try {
   response = await fetcher('/api/v1' + path, {
    method, headers, credentials: 'same-origin', redirect: 'error', cache: 'no-store',
    signal: AbortSignal.timeout(10000),
    ...(body === undefined ? {} : {body: JSON.stringify(body)})
   });
   result = await response.json();
  } catch {
   throw new Error('계정 서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.');
  }
  if (!response.ok || result?.success !== true || !result.data) {
   throw Object.assign(new Error(result?.error?.message || '계정 요청을 처리하지 못했어요.'), {
    status: response.status, code: result?.error?.code, fields: result?.error?.fieldErrors
   });
  }
  return result.data;
 }
 function verifySession(data) {
  if (typeof data.accessToken !== 'string' || !data.accessToken || typeof data.user?.id !== 'string' || !data.user.id) {
   throw new Error('서버의 계정 정보를 확인할 수 없어요.');
  }
  accessToken = data.accessToken;
  return data.user;
 }
 async function refresh(locked) {
  for (let attempt = 0; ; attempt++) {
   try { return await request('/auth/refresh', {method:'POST'}); }
   catch (error) {
    // Without a cross-tab lock, the other tab's successful response may
    // still be on its way. Retry with the browser's cookie, never a saved token.
    if (locked || attempt >= REFRESH_RETRY_DELAYS.length ||
        error.status !== 401 || error.code !== 'INVALID_REFRESH_TOKEN') throw error;
    await new Promise(resolve => setTimeout(resolve, REFRESH_RETRY_DELAYS[attempt]));
   }
  }
 }
 return {
  async authenticate(kind, input) {
   if (kind !== 'login' && kind !== 'signup') throw new TypeError('Unknown account action');
   return withCookieLock(async () => verifySession(await request('/auth/' + kind, {method:'POST', body:input})));
  },
  restore() {
   if (!pendingRestore) {
    pendingRestore = withCookieLock(async locked => {
     const tokens = await refresh(locked);
     if (typeof tokens.accessToken !== 'string' || !tokens.accessToken) throw new Error('로그인 정보를 확인할 수 없어요.');
     const user = await request('/users/me', {token:tokens.accessToken});
     return verifySession({...tokens,user});
    }).finally(() => { pendingRestore = null; });
   }
   return pendingRestore;
  },
  logout() {
   return withCookieLock(async () => {
    const data = await request('/auth/logout', {method:'POST'});
    if (data.loggedOut !== true) throw new Error('로그아웃을 완료하지 못했어요.');
    accessToken = null;
   });
  },
  getAccessToken: () => accessToken
 };
}
