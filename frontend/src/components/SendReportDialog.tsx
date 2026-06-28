"use client";

import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { useSession } from "../hooks/useSession";
import "./SendReportDialog.css";

interface Props {
  jobId: string;
  open: boolean;
  onClose: () => void;
}

interface SendState {
  status: "idle" | "sending" | "success" | "error";
  message?: string;
}

export const SendReportDialog: React.FC<Props> = ({ jobId, open, onClose }) => {
  const { user, loading: sessionLoading } = useSession();
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [send, setSend] = useState<SendState>({ status: "idle" });
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  // Default the recipient to the user's own email — most common case is
  // "email this to me to read on my laptop / forward to investors".
  useEffect(() => {
    if (open && user?.email && !to) {
      setTo(user.email);
    }
  }, [open, user?.email, to]);

  // Focus first input on open + reset state when closed.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => firstInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    setSend({ status: "idle" });
  }, [open]);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (send.status === "sending") return;
    setSend({ status: "sending" });

    try {
      const res = await fetch(
        `/api/reports/${encodeURIComponent(jobId)}/email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: to.trim(), note: note.trim() || undefined }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSend({
          status: "error",
          message:
            (json as { error?: string }).error ??
            `Send failed (${res.status})`,
        });
        return;
      }
      setSend({
        status: "success",
        message:
          (json as { message?: string }).message ?? `Sent to ${to.trim()}.`,
      });
    } catch (err) {
      setSend({
        status: "error",
        message:
          err instanceof Error
            ? err.message
            : "Network error. Try again in a moment.",
      });
    }
  };

  const isSignedIn = !sessionLoading && !!user;
  const isSending = send.status === "sending";

  return (
    <div
      className="send-report-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-report-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="send-report-card">
        <div className="send-report-header">
          <div>
            <h2 id="send-report-title" className="send-report-title">
              Email this report
            </h2>
            <p className="send-report-sub">
              Sent from <strong>alerts@intelliforge.tech</strong> with your
              Chronicle account attached.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="send-report-close"
            aria-label="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {!isSignedIn ? (
          <div className="send-report-body send-report-gate">
            <p>You need a Chronicle account to email reports.</p>
            <a
              className="send-report-cta"
              href={`/sign-in?redirect=${encodeURIComponent(
                typeof window !== "undefined" ? window.location.pathname : "/",
              )}`}
            >
              Sign in to continue
            </a>
          </div>
        ) : send.status === "success" ? (
          <div className="send-report-body send-report-success">
            <div className="send-report-success-icon" aria-hidden="true">
              <Icon name="check" size={28} />
            </div>
            <p className="send-report-success-text">{send.message}</p>
            <button
              type="button"
              onClick={onClose}
              className="send-report-cta"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="send-report-body">
            <label className="send-report-field">
              <span className="send-report-label">Send to</span>
              <input
                ref={firstInputRef}
                type="email"
                required
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="someone@example.com"
                className="send-report-input"
                autoComplete="email"
                disabled={isSending}
              />
            </label>

            <label className="send-report-field">
              <span className="send-report-label">
                Note <span className="send-report-optional">(optional)</span>
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Quick context, e.g. 'TAM/SAM for our seed deck — second section is the one to focus on.'"
                rows={3}
                maxLength={2000}
                className="send-report-textarea"
                disabled={isSending}
              />
              <span className="send-report-counter">{note.length}/2000</span>
            </label>

            {send.status === "error" && (
              <div className="send-report-error" role="alert">
                {send.message}
              </div>
            )}

            <div className="send-report-actions">
              <button
                type="button"
                onClick={onClose}
                className="send-report-secondary"
                disabled={isSending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="send-report-cta"
                disabled={isSending || !to.trim()}
              >
                {isSending ? "Sending…" : "Send report"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
