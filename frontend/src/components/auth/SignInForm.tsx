"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const DEFAULT_CALLBACK = "/research";

function isSafeInternalPath(value: string | null): value is string {
  if (!value) return false;
  return value.startsWith("/") && !value.startsWith("//");
}

export const SignInForm: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCallback = searchParams.get("callbackUrl");
  const callbackUrl = isSafeInternalPath(rawCallback)
    ? rawCallback
    : DEFAULT_CALLBACK;
  const resetSuccess = searchParams.get("reset") === "success";
  const justRegistered = searchParams.get("registered") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    email.trim().length > 0 && password.length > 0 && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (res.ok) {
        router.push(callbackUrl);
        router.refresh();
        return;
      }

      let message = "Sign-in failed. Please try again.";
      if (res.status === 401) {
        message = "Incorrect email or password.";
      } else if (res.status === 429) {
        message = "Too many attempts. Please wait a moment and try again.";
      } else {
        try {
          const data = (await res.json()) as { message?: string };
          if (data?.message) message = data.message;
        } catch {
          // Body wasn't JSON — keep default message.
        }
      }
      setError(message);
      setLoading(false);
    } catch {
      setError("Network error. Check your connection and try again.");
      setLoading(false);
    }
  };

  const errorId = "signin-error";

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

      {!error && resetSuccess && (
        <div className="auth__success" role="status">
          Password updated. Sign in with your new password.
        </div>
      )}

      {!error && !resetSuccess && justRegistered && (
        <div className="auth__notice" role="status">
          Account created. Sign in to continue.
        </div>
      )}

      <div className="auth__field">
        <label htmlFor="signin-email" className="auth__label">
          Email
        </label>
        <input
          id="signin-email"
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
      </div>

      <div className="auth__field">
        <label htmlFor="signin-password" className="auth__label">
          Password
        </label>
        <input
          id="signin-password"
          name="password"
          type="password"
          className="auth__input"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          placeholder="Your password"
        />
        <div className="auth__field-row">
          <Link href="/forgot-password" className="auth__forgot">
            Forgot password?
          </Link>
        </div>
      </div>

      <button
        type="submit"
        className="submit-button"
        disabled={!canSubmit}
        aria-busy={loading}
        aria-label={loading ? "Signing in, please wait" : "Sign in"}
      >
        {loading ? (
          <>
            <span className="submit-spinner" aria-hidden="true" />
            <span>Signing in…</span>
          </>
        ) : (
          <span>Sign in</span>
        )}
      </button>
    </form>
  );
};

export default SignInForm;
