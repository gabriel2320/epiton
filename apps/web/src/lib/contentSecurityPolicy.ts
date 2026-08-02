export type ContentSecurityPolicyOptions = {
  development: boolean;
  nonce: string;
};

const NONCE_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/;

/**
 * Build the request-bound policy used by the Next host.
 *
 * Epiton's current renderers still use React style attributes, so styles keep
 * `unsafe-inline` until those renderers can be migrated independently. Scripts
 * never receive that exception: Next framework scripts are authorized with the
 * per-request nonce and their descendants with `strict-dynamic`.
 */
export function buildContentSecurityPolicy({
  development,
  nonce,
}: ContentSecurityPolicyOptions): string {
  if (!NONCE_PATTERN.test(nonce)) {
    throw new Error("CSP nonce must be a base64 value");
  }

  const scriptSrc = [
    "script-src 'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    development ? "'unsafe-eval'" : null,
  ]
    .filter(Boolean)
    .join(" ");
  const connectSrc = development
    ? "connect-src 'self' http: https: ws: wss:"
    : "connect-src 'self'";

  return [
    "default-src 'self'",
    scriptSrc,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    connectSrc,
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");
}
