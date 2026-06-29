import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { ServiceWorkerRegistration } from "../src/components/pwa/ServiceWorkerRegistration";
import { InstallPrompt } from "../src/components/pwa/InstallPrompt";
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
    default: "Chronicle — Defensible market sizing for founders",
    template: "%s · Chronicle",
  },
  description:
    "Chronicle sizes your market with a multi-agent AI pipeline — TAM/SAM/SOM with credibility-scored sources, contradiction detection, and a citation behind every number.",
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
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    // iOS only honors PNG apple-touch-icons; SVG is ignored on the home screen.
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    title: "Chronicle — Defensible market sizing for founders",
    description:
      "TAM/SAM/SOM in minutes, with a source behind every number. Credibility-scored, contradiction-flagged, auditable.",
    images: ["/og-image.svg"],
    siteName: "Chronicle",
  },
  twitter: {
    card: "summary_large_image",
    title: "Chronicle — Defensible market sizing for founders",
    description:
      "TAM/SAM/SOM in minutes, with a source behind every number. Credibility-scored, contradiction-flagged, auditable.",
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
        <InstallPrompt />
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
                "Defensible market sizing for founders. TAM/SAM/SOM with credibility-scored sources, contradiction detection, and a citation behind every number.",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            }),
          }}
        />
      </body>
    </html>
  );
}
