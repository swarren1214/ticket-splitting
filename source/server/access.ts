import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface AccessEnv {
  PROTOTYPE_PASSWORD?: string;
  PROTOTYPE_SESSION_SECRET?: string;
}

const DAY = 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 4096;
const LOGOUT_PATH = '/__access/logout';

export const accessHeaders = {
  'Cache-Control': 'private, no-store',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
};

function page(message = '', unavailable = false) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Access | Split Ticket Prototype</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; min-height: 100dvh; display: grid; place-items: center; padding: 24px; background: radial-gradient(ellipse at top, #2A3150, #161A28); color: #111827; font-family: system-ui, -apple-system, sans-serif; }
    main { width: 100%; max-width: 400px; padding: 32px; border-radius: 24px; background: #fff; }
    .icon { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 14px; background: #EEF1FF; color: #262AFF; }
    h1 { margin: 20px 0 8px; font-size: 24px; letter-spacing: -.5px; }
    p { margin: 0 0 24px; color: #5B6472; font-size: 15px; line-height: 1.5; }
    label { display: block; margin-bottom: 8px; font-size: 14px; font-weight: 600; }
    input { width: 100%; min-height: 48px; border: 1px solid #DDE1E7; border-radius: 12px; padding: 12px 14px; font: inherit; }
    button { width: 100%; min-height: 48px; margin-top: 20px; border: 0; border-radius: 999px; background: #262AFF; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #2024D9; }
    :focus-visible { outline: 3px solid #7C8BFF; outline-offset: 3px; }
    .error { margin: 12px 0 0; color: #B91C1C; font-size: 14px; }
    @media (max-width: 400px) { main { padding: 24px; } }
  </style>
</head>
<body>
  <main>
    <div class="icon" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/><path d="M12 14v3"/></svg></div>
    <h1>${unavailable ? 'Access unavailable' : 'Split Ticket Prototype'}</h1>
    <p>${unavailable ? 'Access has not been configured. Please contact the prototype owner.' : 'Enter the shared password to continue.'}</p>
    ${unavailable ? '' : `<form method="post">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" maxlength="256" required autofocus${message ? ' aria-invalid="true" aria-describedby="error"' : ''}>
      ${message ? `<p class="error" id="error" role="alert">${message}</p>` : ''}
      <button type="submit">Continue</button>
    </form>`}
  </main>
</body>
</html>`;
}

function html(request: Request, status: number, message = '', unavailable = false) {
  return new Response(request.method === 'HEAD' ? null : page(message, unavailable), {
    status,
    headers: {
      ...accessHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

function cookieName(url: URL) {
  return url.protocol === 'https:' ? '__Host-prototype_access' : 'prototype_access';
}

function cookie(url: URL, value: string, maxAge: number) {
  return `${cookieName(url)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${url.protocol === 'https:' ? '; Secure' : ''}`;
}

function signature(payload: string, password: string, secret: string) {
  // Binding the signature to the password revokes sessions when either secret changes.
  return createHmac('sha256', secret).update(`${password.length}:${password}:${payload}`).digest();
}

function hasSession(request: Request, url: URL, password: string, secret: string) {
  const token = request.headers.get('cookie')?.split(';')
    .map(part => part.trim()).find(part => part.startsWith(cookieName(url) + '='))?.slice(cookieName(url).length + 1);
  const match = token?.match(/^1\.(\d{13})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/);
  if (!match) return false;
  const expires = Number(match[1]);
  if (expires <= Date.now()) return false;
  const expected = signature(`1.${match[1]}.${match[2]}`, password, secret);
  const provided = Buffer.from(match[3], 'base64url');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function redirect(url: URL, sessionCookie: string) {
  return new Response(null, {
    status: 303,
    headers: {
      ...accessHeaders,
      Location: (url.pathname === LOGOUT_PATH ? '/' : url.pathname) + url.search,
      'Set-Cookie': sessionCookie,
    },
  });
}

async function readForm(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    reader.releaseLock();
  }
}

/** Return null only when the request may reach the protected app. */
export async function handleAccess(request: Request, env: AccessEnv): Promise<Response | null> {
  const password = env.PROTOTYPE_PASSWORD;
  const secret = env.PROTOTYPE_SESSION_SECRET;
  if (!password || password.length < 12 || password.length > 256 || !secret || secret.length < 32) {
    console.error('Prototype access requires PROTOTYPE_PASSWORD (12-256 characters) and PROTOTYPE_SESSION_SECRET (at least 32 characters).');
    return html(request, 503, '', true);
  }

  const url = new URL(request.url);
  if (url.pathname === LOGOUT_PATH || request.method === 'POST') {
    if (request.method !== 'POST') {
      const response = html(request, 405, 'Use the Lock prototype button to sign out.');
      response.headers.set('Allow', 'POST');
      return response;
    }
    if (request.headers.get('origin') !== url.origin) {
      return html(request, 403, 'This request could not be verified. Reload the page and try again.');
    }
    if (url.pathname === LOGOUT_PATH) return redirect(url, cookie(url, '', 0));
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') {
      return html(request, 415, 'Submit your password using the form.');
    }
    const body = await readForm(request);
    if (body === null) return html(request, 413, 'The submitted form is too large.');
    const values = new URLSearchParams(body).getAll('password');
    if (values.length !== 1) return html(request, 400, 'Enter a single password.');
    const submitted = createHash('sha256').update(values[0]).digest();
    const expected = createHash('sha256').update(password).digest();
    if (!timingSafeEqual(submitted, expected)) return html(request, 401, 'Incorrect password. Try again.');

    const payload = `1.${Date.now() + DAY}.${randomBytes(16).toString('base64url')}`;
    return redirect(url, cookie(url, `${payload}.${signature(payload, password, secret).toString('base64url')}`, DAY / 1000));
  }

  if (hasSession(request, url, password, secret)) return null;
  if (request.method === 'GET' || request.method === 'HEAD') return html(request, 401);
  const response = html(request, 405, 'Submit your password using the form.');
  response.headers.set('Allow', 'GET, HEAD, POST');
  return response;
}
