import type { Metadata } from "next";
import React from "react";
import { NewsletterPage } from "../../src/views/newsletter/NewsletterPage";

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://deep-research.intelliforge.tech"
).replace(/\/$/, "");

const TITLE = "Subscribe to the Chronicle briefing";
const DESCRIPTION =
  "Founder-grade market research — market sizing, competitive intel, and funding activity, with every claim cited to a source you can click. Free, one-click unsubscribe.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${APP_URL}/newsletter` },
  // This is the URL that gets pasted into LinkedIn, a bio link, and the footer
  // of the briefing itself, so it carries its own share card rather than
  // inheriting the site-wide one.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${APP_URL}/newsletter`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function Page() {
  return <NewsletterPage />;
}
