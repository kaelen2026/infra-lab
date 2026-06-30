/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @infra/shared ships ESM + types from its package exports.
  transpilePackages: ["@infra/shared"],
};

export default nextConfig;
