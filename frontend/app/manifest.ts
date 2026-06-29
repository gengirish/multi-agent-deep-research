import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Chronicle — AI research copilot for founders",
    short_name: "Chronicle",
    description:
      "AI research copilot for founders. Customer discovery, market sizing, and competitive intel with citations.",
    start_url: "/?source=pwa",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#0b1220",
    theme_color: "#0f172a",
    scope: "/",
    lang: "en",
    dir: "ltr",
    prefer_related_applications: false,
    categories: ["business", "productivity", "research"],
    // PNG first for broadest install support (iOS/Android launchers); SVG kept
    // as a crisp any-size fallback for Chromium.
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      {
        name: "New research",
        short_name: "Research",
        description: "Start a new market-sizing research run",
        url: "/research?source=pwa-shortcut",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "History",
        short_name: "History",
        description: "Browse your past research reports",
        url: "/history?source=pwa-shortcut",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Audience",
        short_name: "Audience",
        description: "Manage your newsletter subscribers",
        url: "/audience?source=pwa-shortcut",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
