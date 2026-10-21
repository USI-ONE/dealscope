import type { NextConfig } from "next";

// Baseline hardening. The CSP only covers directives that can't break the
// app (no framing, no plugins, no foreign <base>/form targets); script and
// style sources are left to Next's defaults.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Site walks use the camera; diligence sessions record audio.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Secret tokens live in these URLs — never leak them in a Referer.
      ...["/reset-password/:path*", "/invite/:path*", "/request/:path*", "/deal-room/:path*"].map((source) => ({
        source,
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      })),
    ];
  },
};

export default nextConfig;
