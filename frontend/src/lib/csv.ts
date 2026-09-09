/**
 * Minimal RFC 4180 CSV reader for subscriber imports.
 *
 * Deliberately dependency-free: the only CSV this parses is a contact export
 * (a few columns, a few hundred rows), and pulling a parser into the bundle
 * for that is not worth it. It handles the parts real exports actually use —
 * quoted fields, embedded commas, embedded newlines, doubled quotes as an
 * escape, CRLF or LF line endings, and a UTF-8 BOM.
 *
 * It does NOT handle alternative delimiters or encodings. Those show up as a
 * single-column parse, which the import route reports as "no email column
 * found" rather than silently importing garbage.
 */

/** Parse CSV text into rows of raw string cells. Blank lines are dropped. */
export function parseCsv(input: string): string[][] {
  // Strip a UTF-8 BOM — Excel writes one and it would otherwise corrupt the
  // first header name ("﻿email" never matches "email").
  const text = input.replace(/^﻿/, "");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // Drop rows that are entirely empty (trailing newline, blank separator).
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        // A doubled quote inside a quoted field is a literal quote.
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") {
      // Only a quote at the *start* of a field opens a quoted field; a stray
      // quote mid-field is data (some exporters emit O"Brien unescaped).
      inQuotes = true;
    } else if (char === ",") {
      endField();
    } else if (char === "\n") {
      endRow();
    } else if (char === "\r") {
      // Swallow CR; the following LF (if any) ends the row.
      if (text[i + 1] !== "\n") endRow();
    } else {
      field += char;
    }
  }

  // Final row without a trailing newline.
  if (field !== "" || row.length > 0) endRow();

  return rows;
}

/**
 * Header names we accept for each field, lower-cased and stripped of spaces,
 * underscores and hyphens. Covers Mailchimp, Substack, ConvertKit, beehiiv,
 * Google Contacts and LinkedIn exports without needing a per-vendor mapping.
 */
const HEADER_ALIASES: Record<"email" | "name" | "tags", string[]> = {
  email: [
    "email",
    "emailaddress",
    "email address",
    "e-mail",
    "primaryemail",
    "emailaddress1",
    "work email",
    "workemail",
  ],
  name: [
    "name",
    "fullname",
    "firstname",
    "first name",
    "givenname",
    "displayname",
    "contactname",
    "subscribername",
  ],
  tags: ["tags", "tag", "segment", "segments", "labels", "groups", "list"],
};

function canonical(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]/g, "");
}

export interface CsvColumnMap {
  email: number;
  name: number;
  tags: number;
}

/**
 * Locate the email/name/tags columns in a header row. Returns -1 for columns
 * that aren't present; only `email` is required by callers.
 */
export function mapCsvHeaders(header: string[]): CsvColumnMap {
  const normalized = header.map(canonical);
  const find = (key: keyof typeof HEADER_ALIASES): number =>
    normalized.findIndex((h) => HEADER_ALIASES[key].some((a) => canonical(a) === h));

  return {
    email: find("email"),
    name: find("name"),
    tags: find("tags"),
  };
}

/** Loose email shape check. The real validation is zod's in the route. */
export function looksLikeEmail(value: string): boolean {
  const v = value.trim();
  return v.length >= 3 && v.length <= 254 && /^[^\s@,]+@[^\s@,.]+\.[^\s@,]+$/.test(v);
}

/** Split a tags cell on the separators exporters commonly use. */
export function splitTagsCell(value: string): string[] {
  return value
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean);
}
