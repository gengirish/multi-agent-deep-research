import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { ServiceWorkerRegistration } from "../src/components/pwa/ServiceWorkerRegistration";
import "../src/index.css";
import "../src/accessibility.css";
import "../src/App.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
  variable: "--font-jakarta",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://multi-agent-deep-research-eight.vercel.app"),
  title: {
    default: "Chronicle — Founder-grade AI research, with sources you can defend",
    template: "%s · Chronicle",
  },
  description:
    "Chronicle is an AI research copilot for founders. Run customer discovery, market sizing, and competitive intel in minutes — with citations, contradiction detection, and a visible reasoning trail.",
  applicationName: "Chronicle",
  authors: [{ name: "Girish Hiremath", url: "https://girishbhiremath.vercel.app" }],
  creator: "IntelliForge AI",
  publisher: "IntelliForge AI",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Chronicle",
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    title: "Chronicle — AI research copilot for founders",
    description:
      "Customer discovery, market sizing, and competitive intel in minutes. Cited. Auditable. Built for founders.",
    images: ["/og-image.svg"],
    siteName: "Chronicle",
  },
  twitter: {
    card: "summary_large_image",
    title: "Chronicle — AI research copilot for founders",
    description:
      "Customer discovery, market sizing, and competitive intel in minutes. Cited. Auditable.",
    images: ["/og-image.svg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        {children}
        <ServiceWorkerRegistration />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Chronicle",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              description:
                "AI research copilot for founders. Customer discovery, market sizing, and competitive intel with citations and a visible reasoning trail.",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            }),
          }}
        />
      </body>
    </html>
  );
}
