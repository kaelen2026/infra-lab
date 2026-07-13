/** @type {import('next').NextConfig} */

// Where the API is reachable — same source of truth the web SDK uses
// (`lib/env.ts` reads NEXT_PUBLIC_API_URL, default http://localhost:3001).
const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:3001").replace(
  /\/$/,
  "",
);

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // @infra/design / @infra/sdk / @infra/shared ship ESM + types; resolve them as source.
  transpilePackages: ["@infra/design", "@infra/sdk", "@infra/shared"],
  // Google sign-in web-redirect flow: Better Auth builds the OAuth `redirect_uri`
  // from BETTER_AUTH_URL (the web origin), so Google calls back to
  // `<web>/api/auth/callback/google`, but the callback handler is mounted on the API
  // (`apps/api/src/app.ts` → `/api/auth/callback/*`). Proxy just that path to the API
  // so the origin Better Auth advertises actually reaches the handler — in dev and in
  // prod alike (destination follows NEXT_PUBLIC_API_URL). The rest of the API is called
  // cross-origin by the SDK and is intentionally NOT proxied here.
  async rewrites() {
    return [
      {
        source: "/api/auth/callback/:path*",
        destination: `${apiBaseUrl}/api/auth/callback/:path*`,
      },
    ];
  },
};

export default nextConfig;
