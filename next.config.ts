import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  ...(process.env.NEXT_BUILD_DIR ? { distDir: process.env.NEXT_BUILD_DIR } : {}),
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(self)" },
      { key: "X-Frame-Options", value: "DENY" },
    ] }];
  },
};
export default config;
