import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
      { source: "/v1/:path*", destination: `${BACKEND_URL}/v1/:path*` },
      { source: "/ws/:path*", destination: `${BACKEND_URL}/ws/:path*` },
      { source: "/health", destination: `${BACKEND_URL}/health` },
    ];
  },
};

export default nextConfig;
