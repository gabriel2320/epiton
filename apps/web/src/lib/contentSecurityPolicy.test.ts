import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "./contentSecurityPolicy";

describe("buildContentSecurityPolicy", () => {
  it("authorizes production scripts only through a request nonce", () => {
    const policy = buildContentSecurityPolicy({
      development: false,
      nonce: "c3ludGhldGljLW5vbmNl",
    });

    expect(policy).toContain("script-src 'self' 'nonce-c3ludGhldGljLW5vbmNl' 'strict-dynamic'");
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(
      policy.split("; ").find((directive) => directive.startsWith("script-src ")),
    ).not.toContain("'unsafe-inline'");
  });

  it("allows the development transports required by HMR", () => {
    const policy = buildContentSecurityPolicy({
      development: true,
      nonce: "ZGV2LW5vbmNl",
    });

    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("connect-src 'self' http: https: ws: wss:");
  });

  it("retains the current report, worker, image, and inline-style capabilities", () => {
    const policy = buildContentSecurityPolicy({
      development: false,
      nonce: "c3ludGhldGljLW5vbmNl",
    });

    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain("img-src 'self' data: blob:");
    expect(policy).toContain("worker-src 'self' blob:");
    expect(policy).toContain("frame-src 'self' blob:");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it("rejects values that could inject another directive", () => {
    expect(() =>
      buildContentSecurityPolicy({
        development: false,
        nonce: "invalid'; script-src *",
      }),
    ).toThrow("CSP nonce must be a base64 value");
  });
});
