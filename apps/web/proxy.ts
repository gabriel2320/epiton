import { type NextRequest, NextResponse } from "next/server";
import { buildContentSecurityPolicy } from "./src/lib/contentSecurityPolicy";

const SECURITY_HEADERS = {
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

function createNonce(): string {
  return btoa(crypto.randomUUID());
}

export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const policy = buildContentSecurityPolicy({
    development: process.env.NODE_ENV === "development",
    nonce,
  });
  const requestHeaders = new Headers(request.headers);

  // Next reads both request headers while rendering so it can apply the same
  // nonce to framework scripts. The nonce itself is intentionally not exposed
  // as a standalone response header.
  requestHeaders.set("Content-Security-Policy", policy);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }

  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|epiton.svg).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
