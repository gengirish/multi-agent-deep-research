import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { importSubscribersSchema } from "@/lib/validations";
import {
  importSubscribers,
  isNewsletterAdmin,
  GLOBAL_NEWSLETTER_OWNER_ID,
  type ImportRow,
} from "@/lib/subscribers";
import {
  parseCsv,
  mapCsvHeaders,
  looksLikeEmail,
  splitTagsCell,
} from "@/lib/csv";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse, serverError } from "@/lib/api-utils";

export const runtime = "nodejs";

// Imports write one row at a time, so a huge file is a long-running request.
// Cap both the frequency and the row count rather than the wall clock.
const PER_USER_LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ROWS = 5000;
// Only the first few rejected rows are worth returning — the UI shows them as
// examples, and a file where everything fails would otherwise return a payload
// as large as the input.
const MAX_REPORTED_SKIPS = 25;

/**
 * Bulk import a subscriber CSV.
 *
 * Two shapes are accepted, both handled by the same parser:
 *   - a proper export with headers (email/name/tags, under any of the aliases
 *     in `lib/csv.ts`)
 *   - a bare list of addresses, one per line, no header at all
 *
 * Imported rows land ACTIVE without a confirmation email — see the note on
 * `importSubscribers`. The owner is asserting existing consent.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.sub) {
      return errorResponse("Sign in to import subscribers.", 401);
    }
    if (!isNewsletterAdmin(session.email)) {
      return errorResponse("You don't have access to the newsletter list.", 403);
    }

    if (!rateLimit(`subscribers:import:${session.sub}`, PER_USER_LIMIT, WINDOW_MS)) {
      return errorResponse(
        "You've hit the import limit. Try again in a few minutes.",
        429,
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = importSubscribersSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues[0]?.message ?? "Invalid input",
        400,
      );
    }

    const rows = parseCsv(parsed.data.csv);
    if (rows.length === 0) {
      return errorResponse("That file has no rows in it.", 400);
    }
    if (rows.length > MAX_ROWS) {
      return errorResponse(
        `That file has ${rows.length} rows — the limit is ${MAX_ROWS} per import. Split it and try again.`,
        400,
      );
    }

    // Decide whether row 0 is a header. A header row is one where no cell
    // looks like an email address; a bare list of addresses starts at row 0.
    const first = rows[0];
    const headerLooksLikeData = first.some((cell) => looksLikeEmail(cell));
    const columns = headerLooksLikeData
      ? { email: 0, name: -1, tags: -1 }
      : mapCsvHeaders(first);
    const dataRows = headerLooksLikeData ? rows : rows.slice(1);

    if (columns.email < 0) {
      return errorResponse(
        "No email column found. Add a header row with an \"email\" column, or paste one address per line.",
        400,
      );
    }

    const skipped: Array<{ line: number; value: string; reason: string }> = [];
    const toImport: ImportRow[] = [];

    dataRows.forEach((row, index) => {
      // +1 for the header we consumed, +1 to report 1-based file lines.
      const line = index + (headerLooksLikeData ? 1 : 2);
      const email = (row[columns.email] ?? "").trim();

      if (!email) {
        skipped.push({ line, value: "", reason: "No email address in this row." });
        return;
      }
      if (!looksLikeEmail(email)) {
        skipped.push({ line, value: email, reason: "Not a valid email address." });
        return;
      }

      const name =
        columns.name >= 0 ? (row[columns.name] ?? "").trim().slice(0, 100) : "";
      const tags =
        columns.tags >= 0 ? splitTagsCell(row[columns.tags] ?? "") : [];

      toImport.push({
        email,
        ...(name ? { name } : {}),
        ...(tags.length ? { tags } : {}),
      });
    });

    if (toImport.length === 0) {
      return errorResponse(
        "No valid email addresses found in that file.",
        400,
      );
    }

    const summary = await importSubscribers(
      GLOBAL_NEWSLETTER_OWNER_ID,
      toImport,
      { tags: parsed.data.tags, source: "import" },
    );

    // Parse-time rejections and write-time rejections are the same thing to
    // the person reading the result, so merge them into one list.
    const allSkipped = [...skipped, ...summary.skipped].sort(
      (a, b) => a.line - b.line,
    );

    return NextResponse.json({
      ok: true,
      added: summary.added,
      updated: summary.updated,
      skippedCount: allSkipped.length,
      skipped: allSkipped.slice(0, MAX_REPORTED_SKIPS),
      activeTotal: summary.activeTotal,
    });
  } catch (err) {
    return serverError(err, "POST /api/subscribers/import");
  }
}
