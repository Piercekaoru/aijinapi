import type { NextConfig } from "next";

const backendInternalUrl =
  process.env.BACKEND_INTERNAL_URL?.replace(/\/+$/, "") ??
  "http://127.0.0.1:8080";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${backendInternalUrl}/:path*`,
      },
      {
        source: "/v1/:path*",
        destination: `${backendInternalUrl}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
