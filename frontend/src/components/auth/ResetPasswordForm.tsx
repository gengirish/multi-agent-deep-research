"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const REDIRECT_DELAY_MS = 1500;

export const ResetPasswordForm: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email");

  const hasValidLink = useMemo(
    () =>
      Boolean(token && token.length > 0 && email && email.length > 0),
    [token, email]
  );

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const passwordsMatch = password.length > 0 && password === confirm;
  const strongEnough =
    password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
  const canSubmit =
    hasValidLink &&
    password.length > 0 &&
    confirm.length > 0 &&
    !loading &&
    !success;

  useEffect(() => {
    if (!success) return;
    const t = window.setTimeout(() => {
      router.push("/sign-in?reset=success");
      router.refresh();
    }, REDIRECT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [success, router]);

  if (!hasValidLink) {
    return (
      <div className="auth__form" aria-live="polite">
        <div className="auth__error" role="alert">
          Invalid or expired reset link.
        </div>
        <p className="auth__hint">
          Reset links expire for security. Request a fresh one to continue.
        </p>
        <Link
          href="/forgot-password"
          className="submit-button"
          style={{ textDecoration: "none" }}
        >
          <span>Request a new link</span>
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    if (!strongEnough) {
      setError(
        "Password needs at least 8 characters, including a letter and a digit."
      );
      return;
    }

    if (!passwordsMatch) {
      setError("Passwords don't match.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, password }),
      });

      if (res.ok) {
        setSuccess(true);
        setLoading(false);
        return;
      }

      let message = "Invalid or expired reset link.";
      if (res.status === 429) {
        message = "Too many attempts. Please wait a moment and try again.";
      } else if (res.status !== 400) {
        message = "Something went wrong. Please try again.";
      }
      try {
        const data = (await res.json()) as { message?: string };
        if (data?.message) message = data.message;
      } catch {
        // Body wasn't JSON — keep the default message.
      }
      setError(message);
      setLoading(false);
    } catch {
      setError("Network error. Check your connection and try again.");
      setLoading(false);
    }
  };

  const errorId = "reset-error";
  const matchErrorId = "reset-match-error";
  const showMatchError =
    confirm.length > 0 && password.length > 0 && password !== confirm;

  if (success) {
    return (
      <div className="auth__form" aria-live="polite">
        <div className="auth__success" role="status">
          Password updated. Redirecting you to sign in…
        </div>
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

      {email && (
        <p className="auth__hint" style={{ marginBottom: -6 }}>
          Resetting password for <strong>{email}</strong>
        </p>
      )}

      <div className="auth__field">
        <label htmlFor="reset-password" className="auth__label">
          New password
        </label>
        <input
          id="reset-password"
          name="password"
          type="password"
          className="auth__input"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          aria-invalid={Boolean(error)}
          placeholder="At least 8 characters"
        />
        <p className="auth__hint">
          Use 8+ characters, including a letter and a digit.
        </p>
      </div>

      <div className="auth__field">
        <label htmlFor="reset-confirm" className="auth__label">
          Confirm new password
        </label>
        <input
          id="reset-confirm"
          name="confirm"
          type="password"
          className="auth__input"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={loading}
          aria-invalid={showMatchError}
          aria-describedby={showMatchError ? matchErrorId : undefined}
          placeholder="Type it again"
        />
        {showMatchError && (
          <p className="auth__field-error" id={matchErrorId} role="alert">
            Passwords don&apos;t match.
          </p>
        )}
      </div>

      <button
        type="submit"
        className="submit-button"
        disabled={!canSubmit}
        aria-busy={loading}
        aria-label={
          loading ? "Updating password, please wait" : "Update password"
        }
      >
        {loading ? (
          <>
            <span className="submit-spinner" aria-hidden="true" />
            <span>Updating…</span>
          </>
        ) : (
          <span>Update password</span>
        )}
      </button>
    </form>
  );
};

export default ResetPasswordForm;
