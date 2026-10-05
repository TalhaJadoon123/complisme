/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Content is read from disk at build time; no server runtime is required.
  output: 'standalone',
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;