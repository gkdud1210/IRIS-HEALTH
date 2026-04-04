import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/IRIS-HEALTH",
  trailingSlash: true,
  experimental: {
    inlineCss: true,
  },
};

export default nextConfig;
