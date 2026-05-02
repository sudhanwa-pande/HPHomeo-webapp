/**
 * SSE streaming proxy — forwards EventSource connections to the backend
 * with proper streaming (no buffering).
 *
 * Next.js rewrites buffer response bodies, which breaks SSE. This route
 * handler uses the web-standard fetch + ReadableStream to pipe the backend
 * SSE stream directly to the browser without buffering.
 *
 * URL mapping:
 *   /api/sse/doctor/events/stream  →  http://backend/api/v1/doctor/events/stream
 *   /api/sse/patient/events/stream →  http://backend/api/v1/patient/events/stream
 *   /api/sse/public/events/stream/123 → http://backend/api/v1/public/events/stream/123
 */

import { type NextRequest } from "next/server";

// Force Node.js runtime — Edge runtime may terminate long-lived streams early
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Disable response body size limit for long-lived streams
export const maxDuration = 300; // 5 minutes max (serverless/Vercel)

const rawProxyTarget = process.env.API_PROXY_TARGET;
if (!rawProxyTarget) {
  throw new Error(
    "API_PROXY_TARGET is not set. SSE proxy cannot start without a backend origin.",
  );
}
const API_PROXY_TARGET = rawProxyTarget.replace(/\/$/, "");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const backendPath = `/api/v1/${path.join("/")}`;
  const search = request.nextUrl.search; // preserves ?key=value params
  const targetUrl = `${API_PROXY_TARGET}${backendPath}${search}`;

  // Forward cookies so httpOnly auth cookies reach the backend
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    "Cache-Control": "no-cache",
  };

  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    headers["Cookie"] = cookieHeader;
  }

  // Forward the real client IP for logging / rate limiting
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    headers["X-Forwarded-For"] = forwarded;
  }

  // Abort the backend fetch when the browser disconnects.
  // This propagates client disconnection → backend → Redis cleanup.
  const abortController = new AbortController();
  request.signal.addEventListener("abort", () => abortController.abort());

  let backendResponse: Response;
  try {
    backendResponse = await fetch(targetUrl, {
      headers,
      signal: abortController.signal,
      // @ts-expect-error -- Node 18+ supports this to prevent fetch from buffering
      duplex: "half",
    });
  } catch {
    return new Response("SSE backend unreachable", { status: 502 });
  }

  if (!backendResponse.ok) {
    // For 401 (expired auth cookie), send a synthetic SSE event so the
    // client can trigger a cookie refresh and reconnect — the native
    // EventSource API cannot do this on its own since it doesn't expose
    // the HTTP status code on error.
    if (backendResponse.status === 401) {
      const body = `event: _auth_expired\ndata: {}\n\n`;
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    }

    // For 429 (too many SSE connections), send an SSE event so the client
    // knows to back off heavily instead of the default rapid retry.
    if (backendResponse.status === 429) {
      const body = `event: _rate_limited\ndata: {}\n\n`;
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    }
    const text = await backendResponse.text().catch(() => "");
    return new Response(text, {
      status: backendResponse.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!backendResponse.body) {
    return new Response("No stream body from backend", { status: 502 });
  }

  // Pipe the backend stream through a TransformStream so we get a fresh
  // ReadableStream that Next.js won't try to buffer or prematurely close.
  const { readable, writable } = new TransformStream();
  const backendBody = backendResponse.body;

  // Pipe in the background — when the client disconnects the writable side
  // closes, which aborts the backend fetch via our AbortController.
  backendBody.pipeTo(writable).catch(() => {
    // Client disconnected or backend closed — both are expected for SSE
    abortController.abort();
  });

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
