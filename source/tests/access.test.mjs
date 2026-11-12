import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAccess } from '../server/access.ts';

const origin = 'https://prototype.example';
const env = {
  PROTOTYPE_PASSWORD: 'test-password-not-for-deployment',
  PROTOTYPE_SESSION_SECRET: 'test-signing-secret-not-for-deployment',
};
const request = (path = '/', init) => new Request(origin + path, init);
const post = (body, extra = {}) => ({
  method: 'POST',
  headers: { origin, 'content-type': 'application/x-www-form-urlencoded', ...extra },
  body,
});
const login = (path = '/?device=mobile&full') =>
  handleAccess(request(path, post(new URLSearchParams({ password: env.PROTOTYPE_PASSWORD }))), env);
const session = response => response.headers.get('set-cookie').split(';')[0];

test('unauthenticated pages, scripts and HEAD requests are protected without revealing secrets', async () => {
  for (const path of ['/', '/?device=mobile&full', '/assets/index.js', '/index.html']) {
    const response = await handleAccess(request(path), env);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const body = await response.text();
    assert.match(body, /type="password"/);
    assert.doesNotMatch(body, /type="text"|<script|\/assets\//);
    assert.ok(!body.includes(env.PROTOTYPE_PASSWORD));
    assert.ok(!body.includes(env.PROTOTYPE_SESSION_SECRET));
  }
  const head = await handleAccess(request('/', { method: 'HEAD' }), env);
  assert.equal(head.status, 401);
  assert.equal(await head.text(), '');
});

test('missing or weak server configuration fails closed', async t => {
  t.mock.method(console, 'error', () => {});
  for (const config of [{}, { ...env, PROTOTYPE_PASSWORD: 'short' }, { ...env, PROTOTYPE_SESSION_SECRET: 'short' }]) {
    const response = await handleAccess(request(), config);
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /<form/);
  }
  assert.equal(console.error.mock.callCount(), 3);
});

test('incorrect passwords do not issue sessions; successful login unlocks pages and assets', async () => {
  const incorrect = await handleAccess(request('/', post('password=incorrect')), env);
  assert.equal(incorrect.status, 401);
  assert.equal(incorrect.headers.get('set-cookie'), null);
  assert.match(await incorrect.text(), /Incorrect password/);

  const response = await login();
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/?device=mobile&full');
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /^__Host-prototype_access=/);
  assert.match(setCookie, /Path=\/; HttpOnly; SameSite=Lax; Max-Age=86400; Secure$/);
  assert.ok(!setCookie.includes(env.PROTOTYPE_PASSWORD));
  for (const path of ['/', '/assets/index.js']) {
    assert.equal(await handleAccess(request(path, { headers: { cookie: session(response) } }), env), null);
  }
});

test('forged cookies and sessions signed with an old password or secret are rejected', async () => {
  const value = session(await login());
  const tampered = value.slice(0, -1) + (value.endsWith('a') ? 'b' : 'a');
  for (const cookie of ['__Host-prototype_access=forged', tampered]) {
    assert.equal((await handleAccess(request('/', { headers: { cookie } }), env)).status, 401);
  }
  for (const rotated of [
    { ...env, PROTOTYPE_PASSWORD: 'a-different-shared-password' },
    { ...env, PROTOTYPE_SESSION_SECRET: 'a-different-session-signing-secret' },
  ]) {
    assert.equal((await handleAccess(request('/', { headers: { cookie: value } }), rotated)).status, 401);
  }
});

test('sessions expire after 24 hours', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const cookie = session(await login());
  t.mock.timers.tick(24 * 60 * 60 * 1000 + 1);
  assert.equal((await handleAccess(request('/', { headers: { cookie } }), env)).status, 401);
});

test('cross-origin or unverified login and logout requests cannot change access', async () => {
  for (const path of ['/', '/__access/logout']) {
    for (const originValue of ['https://other.example', 'null', '']) {
      const response = await handleAccess(request(path, post('password=anything', { origin: originValue })), env);
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('set-cookie'), null);
    }
  }
  const getLogout = await handleAccess(request('/__access/logout'), env);
  assert.equal(getLogout.status, 405);
  assert.equal(getLogout.headers.get('set-cookie'), null);
});

test('malformed or oversized login forms are rejected', async () => {
  const cases = [
    [post('password=' + 'x'.repeat(5000)), 413],
    [post('password=one&password=two'), 400],
    [post('{}', { 'content-type': 'application/json' }), 415],
  ];
  for (const [init, status] of cases) {
    const response = await handleAccess(request('/', init), env);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('set-cookie'), null);
  }
});

test('logout clears the session and HTTP local development uses a non-Secure cookie', async () => {
  const response = await handleAccess(request('/__access/logout', post('')), env);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/');
  assert.match(response.headers.get('set-cookie'), /^__Host-prototype_access=;.*Max-Age=0; Secure$/);

  const local = await handleAccess(new Request('http://localhost:5173/', post(
    new URLSearchParams({ password: env.PROTOTYPE_PASSWORD }),
    { origin: 'http://localhost:5173' },
  )), env);
  assert.equal(local.status, 303);
  assert.match(local.headers.get('set-cookie'), /^prototype_access=/);
  assert.doesNotMatch(local.headers.get('set-cookie'), /; Secure/);
});
