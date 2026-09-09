"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addSubscriber,
  deleteSubscriber,
  importSubscribers,
  listSubscribers,
  updateSubscriberTags,
  type ImportResult,
  type Segment,
  type Subscriber,
} from "../../services/subscribersService";
import "./AudiencePage.css";

type LoadState = "loading" | "ready" | "error";

const ALL_SEGMENTS = "__all__";

function formatJoined(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** "investors, beta" → ["investors", "beta"]. Server normalizes further. */
function parseTagInput(value: string): string[] {
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

const STATUS_LABEL: Record<Subscriber["status"], string> = {
  ACTIVE: "Confirmed",
  PENDING: "Pending",
  UNSUBSCRIBED: "Unsubscribed",
};

const STATUS_MODIFIER: Record<Subscriber["status"], string> = {
  ACTIVE: "active",
  PENDING: "pending",
  UNSUBSCRIBED: "unsub",
};

export const AudiencePage: React.FC = () => {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string>("");

  const [activeFilter, setActiveFilter] = useState<string>(ALL_SEGMENTS);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string>("");

  const [removingId, setRemovingId] = useState<string | null>(null);

  // Inline segment editing: which row is open, and its draft text.
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [savingTagsId, setSavingTagsId] = useState<string | null>(null);

  // CSV import panel.
  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importTags, setImportTags] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filterTag = activeFilter === ALL_SEGMENTS ? undefined : activeFilter;

  const refresh = useCallback(
    async (tag?: string) => {
      const data = await listSubscribers(tag);
      setSubscribers(data.subscribers);
      setSegments(data.segments);
      return data;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setLoadError("");
    refresh(filterTag)
      .then(() => {
        if (!cancelled) setLoadState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Could not load subscribers.",
        );
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [refresh, filterTag]);

  // Counts describe the rows currently in view, so they stay consistent with
  // the table under a segment filter.
  const counts = useMemo(() => {
    let active = 0;
    let pending = 0;
    let unsubscribed = 0;
    for (const s of subscribers) {
      if (s.status === "ACTIVE") active += 1;
      else if (s.status === "PENDING") pending += 1;
      else unsubscribed += 1;
    }
    return { active, pending, unsubscribed, total: subscribers.length };
  }, [subscribers]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adding) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setAddError("Enter an email address.");
      return;
    }
    setAdding(true);
    setAddError("");
    try {
      await addSubscriber(
        trimmedEmail,
        name.trim() || undefined,
        parseTagInput(tagInput),
      );
      // Refetch rather than splicing the row in: an add can also create a new
      // segment, and the segment counts have to move with it.
      await refresh(filterTag);
      setEmail("");
      setName("");
      setTagInput("");
    } catch (err) {
      setAddError(
        err instanceof Error ? err.message : "Could not add subscriber.",
      );
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (sub: Subscriber) => {
    const label = sub.name?.trim() || sub.email;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Remove ${label} from your audience?`)
    ) {
      return;
    }
    setRemovingId(sub.id);
    try {
      await deleteSubscriber(sub.id);
      await refresh(filterTag);
    } catch (err) {
      setAddError(
        err instanceof Error ? err.message : "Could not remove subscriber.",
      );
    } finally {
      setRemovingId(null);
    }
  };

  const startEditingTags = (sub: Subscriber) => {
    setEditingTagsId(sub.id);
    setTagDraft(sub.tags.join(", "));
  };

  const cancelEditingTags = () => {
    setEditingTagsId(null);
    setTagDraft("");
  };

  const commitTags = async (sub: Subscriber) => {
    const next = parseTagInput(tagDraft);
    // Nothing changed — close without a round-trip.
    if (next.join(",") === sub.tags.join(",")) {
      cancelEditingTags();
      return;
    }
    setSavingTagsId(sub.id);
    try {
      await updateSubscriberTags(sub.id, next);
      await refresh(filterTag);
      cancelEditingTags();
    } catch (err) {
      setAddError(
        err instanceof Error ? err.message : "Could not update segments.",
      );
    } finally {
      setSavingTagsId(null);
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError("");
    setImportResult(null);
    try {
      setCsvText(await file.text());
    } catch {
      setImportError("Could not read that file.");
    }
    // Reset so picking the same file twice still fires a change event.
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (importing) return;
    if (!csvText.trim()) {
      setImportError("Paste some rows or choose a CSV file first.");
      return;
    }
    setImporting(true);
    setImportError("");
    setImportResult(null);
    try {
      const result = await importSubscribers(
        csvText,
        parseTagInput(importTags),
      );
      setImportResult(result);
      setCsvText("");
      await refresh(filterTag);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="audience-page">
      <header className="audience-header">
        <h1 className="audience-title">Audience</h1>
        <p className="audience-subtitle">
          The Chronicle newsletter list — everyone who confirmed a subscription
          from the site, plus anyone you add or import here. Tag people into
          segments, then broadcast any research briefing to a segment or to the
          whole list.
        </p>
      </header>

      <section className="audience-add" aria-label="Add subscriber">
        <form className="audience-form" onSubmit={handleAdd}>
          <div className="audience-form-fields">
            <label className="audience-field">
              <span className="audience-label">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="reader@example.com"
                className="audience-input"
                autoComplete="email"
                disabled={adding}
              />
            </label>
            <label className="audience-field">
              <span className="audience-label">
                Name <span className="audience-optional">(optional)</span>
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                className="audience-input"
                autoComplete="name"
                disabled={adding}
              />
            </label>
            <label className="audience-field">
              <span className="audience-label">
                Segments <span className="audience-optional">(optional)</span>
              </span>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="investors, beta"
                className="audience-input"
                disabled={adding}
              />
            </label>
          </div>
          <button
            type="submit"
            className="audience-add-btn"
            disabled={adding || !email.trim()}
          >
            {adding ? "Adding…" : "Add subscriber"}
          </button>
        </form>
        <p className="audience-hint">
          People you add here are marked confirmed immediately — you&rsquo;re
          vouching for their consent. Sign-ups from the site have to confirm by
          email before they can receive anything.
        </p>
        {addError && (
          <div className="audience-inline-error" role="alert">
            {addError}
          </div>
        )}
      </section>

      {/* CSV import ------------------------------------------------------- */}
      <section className="audience-import" aria-label="Import subscribers">
        <button
          type="button"
          className="audience-import-toggle"
          onClick={() => setImportOpen((open) => !open)}
          aria-expanded={importOpen}
        >
          <span className="audience-import-toggle-label">
            Import from CSV
          </span>
          <span className="audience-import-chevron" aria-hidden="true">
            {importOpen ? "−" : "+"}
          </span>
        </button>

        {importOpen && (
          <form className="audience-import-body" onSubmit={handleImport}>
            <p className="audience-hint">
              Paste rows or choose a file. A header row with{" "}
              <code>email</code> (plus optional <code>name</code> and{" "}
              <code>tags</code>) is understood, and so is a bare list of one
              address per line. Imported addresses are added as confirmed
              without an opt-in email, so only import a list that already opted
              in to hearing from you.
            </p>

            <textarea
              className="audience-textarea"
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                setImportResult(null);
              }}
              rows={6}
              spellCheck={false}
              placeholder={"email,name,tags\nada@example.com,Ada Lovelace,investors"}
              disabled={importing}
              aria-label="CSV contents"
            />

            <div className="audience-import-controls">
              <input
                ref={fileInputRef}
                id="audience-csv-file"
                type="file"
                accept=".csv,text/csv,text/plain"
                className="audience-file-input"
                onChange={handleFilePick}
                disabled={importing}
              />
              <label
                htmlFor="audience-csv-file"
                className="audience-file-label"
              >
                Choose CSV file
              </label>

              <input
                type="text"
                value={importTags}
                onChange={(e) => setImportTags(e.target.value)}
                placeholder="Tag everyone as… (optional)"
                className="audience-input audience-input--inline"
                disabled={importing}
                aria-label="Segments applied to every imported row"
              />

              <button
                type="submit"
                className="audience-add-btn"
                disabled={importing || !csvText.trim()}
              >
                {importing ? "Importing…" : "Import"}
              </button>
            </div>

            {importError && (
              <div className="audience-inline-error" role="alert">
                {importError}
              </div>
            )}

            {importResult && (
              <div className="audience-import-result" role="status">
                <p className="audience-import-summary">
                  <strong>{importResult.added}</strong> added ·{" "}
                  <strong>{importResult.updated}</strong> already on the list ·{" "}
                  <strong>{importResult.skippedCount}</strong> skipped ·{" "}
                  <strong>{importResult.activeTotal}</strong> confirmed total
                </p>
                {importResult.skipped.length > 0 && (
                  <ul className="audience-skip-list">
                    {importResult.skipped.map((row) => (
                      <li key={`${row.line}-${row.value}`}>
                        Line {row.line}
                        {row.value ? ` (${row.value})` : ""}: {row.reason}
                      </li>
                    ))}
                    {importResult.skippedCount >
                      importResult.skipped.length && (
                      <li>
                        …and{" "}
                        {importResult.skippedCount -
                          importResult.skipped.length}{" "}
                        more.
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </form>
        )}
      </section>

      {/* Segment filter --------------------------------------------------- */}
      {segments.length > 0 && (
        <section className="audience-segments" aria-label="Filter by segment">
          <button
            type="button"
            className={`audience-chip${
              activeFilter === ALL_SEGMENTS ? " audience-chip--on" : ""
            }`}
            onClick={() => setActiveFilter(ALL_SEGMENTS)}
            aria-pressed={activeFilter === ALL_SEGMENTS}
          >
            Everyone
          </button>
          {segments.map((seg) => (
            <button
              key={seg.tag}
              type="button"
              className={`audience-chip${
                activeFilter === seg.tag ? " audience-chip--on" : ""
              }`}
              onClick={() => setActiveFilter(seg.tag)}
              aria-pressed={activeFilter === seg.tag}
              title={`${seg.active} confirmed of ${seg.total} tagged`}
            >
              {seg.tag}
              <span className="audience-chip-count">{seg.active}</span>
            </button>
          ))}
        </section>
      )}

      <div className="audience-stat" aria-live="polite">
        <strong>{counts.active}</strong> confirmed
        {counts.pending > 0 && (
          <>
            {" · "}
            <strong>{counts.pending}</strong> awaiting confirmation
          </>
        )}
        {" · "}
        <strong>{counts.total}</strong>{" "}
        {filterTag ? `in “${filterTag}”` : "total"}
      </div>

      <section className="audience-list-wrap" aria-label="Subscribers">
        {loadState === "loading" && (
          <div className="audience-state audience-state--loading">
            Loading your audience…
          </div>
        )}

        {loadState === "error" && (
          <div className="audience-state audience-state--error" role="alert">
            {loadError}
          </div>
        )}

        {loadState === "ready" && subscribers.length === 0 && (
          <div className="audience-empty">
            <p className="audience-empty-title">
              {filterTag ? `Nobody is tagged “${filterTag}”` : "No subscribers yet"}
            </p>
            <p className="audience-empty-text">
              {filterTag
                ? "Tag someone with this segment from the list, or clear the filter to see everyone."
                : "Add your first reader above, import a CSV, or point people at the sign-up page. Once you have an audience, you can broadcast any research briefing to them in one click."}
            </p>
          </div>
        )}

        {loadState === "ready" && subscribers.length > 0 && (
          <div className="audience-table" role="table">
            <div className="audience-row audience-row--head" role="row">
              <span className="audience-col audience-col--name" role="columnheader">
                Name
              </span>
              <span className="audience-col audience-col--email" role="columnheader">
                Email
              </span>
              <span className="audience-col audience-col--tags" role="columnheader">
                Segments
              </span>
              <span className="audience-col audience-col--status" role="columnheader">
                Status
              </span>
              <span className="audience-col audience-col--date" role="columnheader">
                Joined
              </span>
              <span className="audience-col audience-col--action" role="columnheader">
                <span className="audience-sr-only">Actions</span>
              </span>
            </div>

            {subscribers.map((sub) => (
              <div className="audience-row" role="row" key={sub.id}>
                <span className="audience-col audience-col--name" role="cell">
                  {sub.name?.trim() ? sub.name : "—"}
                </span>
                <span className="audience-col audience-col--email" role="cell">
                  {sub.email}
                </span>
                <span className="audience-col audience-col--tags" role="cell">
                  {editingTagsId === sub.id ? (
                    <input
                      type="text"
                      className="audience-input audience-input--tags"
                      value={tagDraft}
                      autoFocus
                      disabled={savingTagsId === sub.id}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onBlur={() => commitTags(sub)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitTags(sub);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEditingTags();
                        }
                      }}
                      aria-label={`Segments for ${sub.email}`}
                      placeholder="investors, beta"
                    />
                  ) : (
                    <button
                      type="button"
                      className="audience-tags-btn"
                      onClick={() => startEditingTags(sub)}
                      aria-label={`Edit segments for ${sub.email}`}
                    >
                      {sub.tags.length > 0 ? (
                        sub.tags.map((tag) => (
                          <span className="audience-tag" key={tag}>
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="audience-tag-empty">+ segment</span>
                      )}
                    </button>
                  )}
                </span>
                <span className="audience-col audience-col--status" role="cell">
                  <span
                    className={`audience-badge audience-badge--${STATUS_MODIFIER[sub.status]}`}
                    title={
                      sub.status === "PENDING"
                        ? "Signed up but hasn't clicked the confirmation link — excluded from broadcasts."
                        : undefined
                    }
                  >
                    {STATUS_LABEL[sub.status]}
                  </span>
                </span>
                <span className="audience-col audience-col--date" role="cell">
                  {formatJoined(sub.createdAt)}
                </span>
                <span className="audience-col audience-col--action" role="cell">
                  <button
                    type="button"
                    className="audience-remove-btn"
                    onClick={() => handleRemove(sub)}
                    disabled={removingId === sub.id}
                  >
                    {removingId === sub.id ? "Removing…" : "Remove"}
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
