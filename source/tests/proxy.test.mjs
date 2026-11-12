import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('compiled middleware loads under Node ESM and gates requests before passing through', async () => {
  const output = await mkdtemp(join(root, 'tests', '.proxy-runtime-'));
  try {
    await mkdir(join(output, 'server'));
    await writeFile(join(output, 'package.json'), '{"type":"module"}');
    for (const file of ['proxy', 'server/access']) {
      const source = await readFile(join(root, file + '.ts'), 'utf8');
      const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
      });
      await writeFile(join(output, file + '.js'), compiled.outputText);
    }

    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import proxy from './proxy.js';
      const origin = 'https://prototype.example';
      const denied = await proxy(new Request(origin + '/assets/index.js'));
      assert.equal(denied.status, 401);
      assert.equal(denied.headers.get('x-middleware-next'), null);
      const login = await proxy(new Request(origin + '/', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ password: process.env.PROTOTYPE_PASSWORD }),
      }));
      assert.equal(login.status, 303);
      const cookie = login.headers.get('set-cookie').split(';')[0];
      const allowed = await proxy(new Request(origin + '/assets/index.js', { headers: { cookie } }));
      assert.equal(allowed.headers.get('x-middleware-next'), '1');
      assert.equal(allowed.headers.get('cache-control'), 'private, no-store');
    `], {
      cwd: output,
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        PROTOTYPE_PASSWORD: 'runtime-test-password-not-for-deployment',
        PROTOTYPE_SESSION_SECRET: 'runtime-test-secret-not-for-deployment',
      },
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
