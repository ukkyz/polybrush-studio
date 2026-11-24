import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native addon; let Node load it directly on the server.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
