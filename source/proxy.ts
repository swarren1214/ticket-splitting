import { next } from '@vercel/functions';
import { accessHeaders, handleAccess } from './server/access.js';

export const config = { runtime: 'nodejs' };

export default async function proxy(request: Request) {
  const response = await handleAccess(request, process.env) ?? next();
  for (const [name, value] of Object.entries(accessHeaders)) response.headers.set(name, value);
  return response;
}
