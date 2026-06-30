/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @infra/sdk / @infra/shared ship ESM + types; resolve them as source.
  transpilePackages: ["@infra/sdk", "@infra/shared"],
};

export default nextConfig;
