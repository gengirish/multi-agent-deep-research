/**
 * Server-side markdown → HTML renderer used by transactional emails.
 *
 * Why a dedicated wrapper instead of importing marked directly?
 *   - Centralizes safety: `mangle` and raw-HTML pass-through are disabled so
 *     a malicious report can't smuggle <script> through the email.
 *   - Keeps the dependency import in one place (easy to swap for unified +
 *     remark-html later if we adopt the unified ecosystem on the server).
 *
 * marked v9+ does NOT pass raw HTML through by default — text-only markdown is
 * escaped. We still set `breaks: true` so single newlines render as <br/>,
 * matching how readers expect the report to look in their inbox.
 */

import { marked, type MarkedOptions } from "marked";

const SAFE_OPTIONS: MarkedOptions = {
  gfm: true,
  breaks: true,
  // marked deprecated headerIds and mangle in v9; both are off-by-default now.
  // We pass them explicitly so the intent is grep-able in case marked changes
  // its defaults again.
  pedantic: false,
};

export function renderMarkdownToHtml(md: string): string {
  if (!md) return "";
  // marked.parse is sync when given a string and no async extensions.
  const html = marked.parse(md, SAFE_OPTIONS) as string;
  return html;
}
