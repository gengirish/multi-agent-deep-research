"use client";

import React, { useState } from "react";

const FALLBACK_SUCCESS =
  "If an account exists for that email, we've sent a reset link. Check your inbox (and spam folder).";

export const ForgotPasswordForm: React.FC = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && !loading && !successMessage;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (res.status === 429) {
        setError("Too many attempts. Please wait a moment and try again.");
        setLoading(false);
        return;
      }

      let message = FALLBACK_SUCCESS;
      try {
        const data = (await res.json()) as { message?: string };
        if (data?.message) message = data.message;
      } catch {
        // Body wasn't JSON — fall back to the neutral success copy.
      }
      setSuccessMessage(message);
      setLoading(false);
    } catch {
      setError("Network error. Check your connection and try again.");
      setLoading(false);
    }
  };

  const errorId = "forgot-error";

  if (successMessage) {
    return (
      <div className="auth__form" aria-live="polite">
        <div className="auth__success" role="status">
          {successMessage}
        </div>
        <p className="auth__hint">
          Didn&apos;t receive an email? Wait a few minutes and try again, or
          send a link to a different address.
        </p>
        <button
          type="button"
          className="submit-button"
          onClick={() => {
            setSuccessMessage(null);
            setError(null);
            setEmail("");
          }}
        >
          <span>Use a different email</span>
        </button>
      </div>
    );
  }

  return (
    <form
      className="auth__form"
      onSubmit={handleSubmit}
      noValidate
      aria-describedby={error ? errorId : undefined}
    >
      {error && (
        <div className="auth__error" id={errorId} role="alert">
          {error}
        </div>
      )}

      <div className="auth__field">
        <label htmlFor="forgot-email" className="auth__label">
          Email
        </label>
        <input
          id="forgot-email"
          name="email"
          type="email"
          className="auth__input"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          placeholder="you@example.com"
          inputMode="email"
        />
        <p className="auth__hint">
          We&apos;ll send a reset link to this address if an account exists.
        </p>
      </div>

      <button
        type="submit"
        className="submit-button"
        disabled={!canSubmit}
        aria-busy={loading}
        aria-label={loading ? "Sending reset link, please wait" : "Send reset link"}
      >
        {loading ? (
          <>
            <span className="submit-spinner" aria-hidden="true" />
            <span>Sending…</span>
          </>
        ) : (
          <span>Send reset link</span>
        )}
      </button>
    </form>
  );
};

export default ForgotPasswordForm;
