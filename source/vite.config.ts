import { Readable } from 'node:stream';
import { defineConfig, loadEnv, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { accessHeaders, handleAccess, type AccessEnv } from './server/access';

function passwordGate(env: AccessEnv): Plugin {
  const configure = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req, res, next) => {
      const run = async () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers)) {
          if (Array.isArray(value)) value.forEach(v => headers.append(name, v));
          else if (value !== undefined) headers.set(name, value);
        }
        const method = req.method ?? 'GET';
        const init: RequestInit & { duplex?: 'half' } = { method, headers };
        if (method !== 'GET' && method !== 'HEAD') {
          init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>;
          init.duplex = 'half';
        }
        const request = new Request(new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`), init);
        const response = await handleAccess(request, env);
        for (const [name, value] of Object.entries(accessHeaders)) res.setHeader(name, value);
        if (!response) { next(); return; }
        res.statusCode = response.status;
        response.headers.forEach((value, name) => res.setHeader(name, value));
        res.end(Buffer.from(await response.arrayBuffer()));
      };
      void run().catch(next);
    });
  };
  return { name: 'prototype-password', configureServer: configure, configurePreviewServer: configure };
}

// The single-file export is an unprotected offline artifact; HTTP access uses the server gate.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [passwordGate(env), react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
    base: './',
  };
});
