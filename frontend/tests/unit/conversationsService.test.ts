import { describe, expect, it } from "vitest";
import { formatTimestamp } from "@/services/conversationsService";

/**
 * Timestamps are rendered in the viewer's zone, so these assert on the
 * instant rather than on formatted text — otherwise the suite would pass or
 * fail depending on where it runs.
 */
const instant = (s: string) => new Date(`${s}Z`).getTime();
const parsed = (formatted: string) => new Date(formatted).getTime();

describe("formatTimestamp", () => {
  it("renders the ISO 8601 shape the API actually sends", () => {
    // Regression: this was parsed with substring offsets meant for the old
    // compact format, yielding NaN fields and a literal "Invalid Date".
    const out = formatTimestamp("2026-09-11T08:58:11.336904");
    expect(out).not.toMatch(/Invalid Date/);
    expect(parsed(out)).toBe(instant("2026-09-11T08:58:11"));
  });

  it("treats an offset-less timestamp as UTC, not local", () => {
    // The backend stores UTC; JS would otherwise read this as local time and
    // shift every row by the viewer's offset.
    expect(parsed(formatTimestamp("2026-09-11T08:58:11.336904"))).toBe(
      Date.UTC(2026, 8, 11, 8, 58, 11)
    );
  });

  it("honours an explicit zone when one is present", () => {
    expect(parsed(formatTimestamp("2026-09-11T08:58:11+05:30"))).toBe(
      Date.UTC(2026, 8, 11, 3, 28, 11)
    );
    expect(parsed(formatTimestamp("2026-09-11T08:58:11Z"))).toBe(
      Date.UTC(2026, 8, 11, 8, 58, 11)
    );
  });

  it("still reads the pre-Postgres compact format", () => {
    expect(parsed(formatTimestamp("20260911_085811_336904"))).toBe(
      Date.UTC(2026, 8, 11, 8, 58, 11)
    );
  });

  it("falls back to an em dash instead of showing 'Invalid Date'", () => {
    for (const bad of ["", "   ", "not-a-date", "20261301_999999"]) {
      expect(formatTimestamp(bad)).toBe("—");
    }
  });

  it("does not throw on null or undefined from an older payload", () => {
    expect(formatTimestamp(undefined as unknown as string)).toBe("—");
    expect(formatTimestamp(null as unknown as string)).toBe("—");
  });
});
