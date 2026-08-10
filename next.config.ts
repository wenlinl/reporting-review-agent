import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
