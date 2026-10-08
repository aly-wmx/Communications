import type { NextConfig } from "next";

// Browser-side protections on every page and API response.
const securityHeaders = [
  // No other site can show the portal in a frame (stops click-jacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Kept narrow so Next.js scripts and styles keep working; blocks framing, plugins,
  // a hijacked <base>, and forms posting anywhere but the portal.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
