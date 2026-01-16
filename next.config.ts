import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  
  // Allow external access in development mode
  allowedDevOrigins: [
    "207.180.226.85",
    "localhost",
  ],
};

export default nextConfig;
