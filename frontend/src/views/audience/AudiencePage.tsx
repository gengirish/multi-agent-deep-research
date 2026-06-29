"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  addSubscriber,
  deleteSubscriber,
  listSubscribers,
  type Subscriber,
} from "../../services/subscribersService";
import "./AudiencePage.css";

type LoadState = "loading" | "ready" | "error";

function formatJoined(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const AudiencePage: React.FC = () => {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string>("");

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string>("");

  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setLoadError("");
    listSubscribers()
      .then((rows) => {
        if (cancelled) return;
        setSubscribers(rows);
        setLoadState("ready");
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
  }, []);

  const { activeCount, totalCount } = useMemo(() => {
    const total = subscribers.length;
    const active = subscribers.filter((s) => s.status === "ACTIVE").length;
    return { activeCount: active, totalCount: total };
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
      const { subscriber, created } = await addSubscriber(
        trimmedEmail,
        name.trim() || undefined,
      );
      setSubscribers((prev) => {
        const without = prev.filter((s) => s.id !== subscriber.id);
        return [subscriber, ...without];
      });
      if (!created) {
        setAddError("That address is already on your list.");
      }
      setEmail("");
      setName("");
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
      setSubscribers((prev) => prev.filter((s) => s.id !== sub.id));
    } catch (err) {
      // Surface the failure inline at the top of the form area.
      setAddError(
        err instanceof Error ? err.message : "Could not remove subscriber.",
      );
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="audience-page">
      <header className="audience-header">
        <h1 className="audience-title">Audience</h1>
        <p className="audience-subtitle">
          The Chronicle newsletter list — everyone who subscribed from the
          site, plus anyone you add here. Broadcast any research briefing to
          this list.
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
          </div>
          <button
            type="submit"
            className="audience-add-btn"
            disabled={adding || !email.trim()}
          >
            {adding ? "Adding…" : "Add subscriber"}
          </button>
        </form>
        {addError && (
          <div className="audience-inline-error" role="alert">
            {addError}
          </div>
        )}
      </section>

      <div className="audience-stat" aria-live="polite">
        <strong>{activeCount}</strong> active ·{" "}
        <strong>{totalCount}</strong> total
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
            <p className="audience-empty-title">No subscribers yet</p>
            <p className="audience-empty-text">
              Add your first reader above. Once you have an audience, you can
              broadcast any research briefing to them in one click.
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
                <span className="audience-col audience-col--status" role="cell">
                  <span
                    className={`audience-badge audience-badge--${
                      sub.status === "ACTIVE" ? "active" : "unsub"
                    }`}
                  >
                    {sub.status === "ACTIVE" ? "Active" : "Unsubscribed"}
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
