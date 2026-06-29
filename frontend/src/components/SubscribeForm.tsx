"use client";

import React, { useState } from "react";
import "./SubscribeForm.css";

interface Props {
  /** "panel" = full card (landing). "inline" = compact (report footer). */
  variant?: "panel" | "inline";
  title?: string;
  subtitle?: string;
  className?: string;
}

type Status = "idle" | "submitting" | "success" | "error";

export const SubscribeForm: React.FC<Props> = ({
  variant = "panel",
  title = "Get the Chronicle briefing",
  subtitle = "Cited, defensible research delivered to your inbox. No spam — unsubscribe in one click.",
  className,
}) => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "submitting") return;
    const trimmed = email.trim();
    if (!trimmed) return;

    setStatus("submitting");
    setMessage("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setStatus("error");
        setMessage(json.error ?? `Something went wrong (${res.status}).`);
        return;
      }
      setStatus("success");
      setMessage(json.message ?? "You're subscribed.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again in a moment.");
    }
  };

  const rootClass = [
    "subscribe",
    `subscribe--${variant}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      <div className="subscribe__copy">
        <h3 className="subscribe__title">{title}</h3>
        <p className="subscribe__subtitle">{subtitle}</p>
      </div>

      {status === "success" ? (
        <div className="subscribe__success" role="status">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
            <path
              d="m20 6-11 11-5-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{message}</span>
        </div>
      ) : (
        <form className="subscribe__form" onSubmit={handleSubmit} noValidate>
          <div className="subscribe__row">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="subscribe__input"
              aria-label="Email address"
              autoComplete="email"
              disabled={status === "submitting"}
            />
            <button
              type="submit"
              className="subscribe__btn"
              disabled={status === "submitting" || !email.trim()}
            >
              {status === "submitting" ? "Subscribing…" : "Subscribe"}
            </button>
          </div>
          {status === "error" && (
            <p className="subscribe__error" role="alert">
              {message}
            </p>
          )}
        </form>
      )}
    </div>
  );
};
