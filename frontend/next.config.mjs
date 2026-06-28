/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `agentmail` is a server-only SDK with an optional `@x402/fetch` peer
  // pulled in by its payment wrapper. Bundling it through webpack pulls in
  // that peer even though we never call it. Externalize so Node requires it
  // at runtime in the serverless function — the optional peer is then a
  // lazy resolution and never blocks the build.
  experimental: {
    serverComponentsExternalPackages: ["agentmail"],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
        ],
      },
    ];
  },
};

export default nextConfig;
