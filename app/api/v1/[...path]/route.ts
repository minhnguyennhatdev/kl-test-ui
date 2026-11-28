// Same-origin proxy: the browser only ever talks to this Next.js server, which
// forwards /api/v1/* to the scheduler API over the cluster's internal network.
// The API itself is never exposed publicly (and sends no CORS headers).
//
// SCHEDULER_API is read per request, at runtime, so one image works in every
// environment: set it on the container (the Helm chart does), e.g.
//   SCHEDULER_API=http://kl-test-api.kl-test.svc.cluster.local:3000
import type { NextRequest } from 'next/server';

const UPSTREAM_TIMEOUT_MS = 30_000;

// Hop-by-hop headers (RFC 9110 §7.6.1) plus ones fetch recomputes itself.
const DROP_REQUEST = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  'accept-encoding',
]);

// fetch() has already decoded the body, so the original encoding/length no longer apply.
const DROP_RESPONSE = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-encoding',
  'content-length',
]);

function upstreamBase(): string {
  return (process.env.SCHEDULER_API ?? 'http://localhost:3000').replace(/\/+$/, '');
}

function problem(status: number, title: string, detail: string): Response {
  return Response.json(
    { type: 'about:blank', title, detail },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

async function proxy(request: NextRequest, ctx: RouteContext<'/api/v1/[...path]'>): Promise<Response> {
  const { path } = await ctx.params;

  // Segments arrive decoded; refuse traversal and re-encode the rest so the
  // request can only ever land under the API's /api/v1 prefix.
  if (path.some((segment) => segment === '..' || segment === '.' || segment === '')) {
    return problem(400, 'Bad Request', 'Invalid path.');
  }
  // Next.js hands over a normalized query (e.g. %20 → +); it is equivalent for the API.
  const target = `${upstreamBase()}/api/v1/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!DROP_REQUEST.has(key.toLowerCase())) headers.set(key, value);
  });
  // Cloudflare puts the visitor's address here; keep it for the API's logs.
  const clientIp = request.headers.get('cf-connecting-ip');
  if (clientIp) headers.set('x-forwarded-for', clientIp);
  headers.set('x-forwarded-host', request.headers.get('host') ?? '');
  headers.set('x-forwarded-proto', request.headers.get('x-forwarded-proto') ?? 'https');

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    console.error(`proxy ${request.method} ${target} failed:`, error);
    return timedOut
      ? problem(504, 'Gateway Timeout', 'The scheduler API did not answer in time.')
      : problem(502, 'Bad Gateway', 'The scheduler API is unreachable.');
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!DROP_RESPONSE.has(key.toLowerCase())) responseHeaders.append(key, value);
  });

  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
