"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface Strength {
  score: 0 | 1 | 2 | 3;
  hasLength: boolean;
  hasLetter: boolean;
  hasDigit: boolean;
  label: string;
  tone: "weak" | "ok" | "strong";
}

function scorePassword(pw: string): Strength {
  const hasLength = pw.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const checks = [hasLength, hasLetter, hasDigit];
  const passed = checks.filter(Boolean).length as 0 | 1 | 2 | 3;

  let label = "Too short";
  let tone: Strength["tone"] = "weak";
  if (passed === 3) {
    label = "Strong";
    tone = "strong";
  } else if (passed === 2) {
    label = "Decent";
    tone = "ok";
  } else if (passed === 1) {
    label = "Weak";
    tone = "weak";
  } else if (pw.length === 0) {
    label = "Enter a password";
    tone = "weak";
  }

  return { score: passed, hasLength, hasLetter, hasDigit, label, tone };
}

export const SignUpForm: React.FC = () => {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = useMemo(() => scorePassword(password), [password]);

  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length > 0 &&
    !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    if (strength.score < 3) {
      setError(
        "Password needs at least 8 characters, including a letter and a digit."
      );
      return;
    }

    setError(null);
    setLoading(true);

    const trimmedEmail = email.trim();
    const trimmedName = name.trim();

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          name: trimmedName,
          password,
        }),
      });

      if (!res.ok) {
        let message = "Sign-up failed. Please try again.";
        if (res.status === 409) {
          message = "An account with that email already exists.";
        } else if (res.status === 429) {
          message = "Too many attempts. Please wait a moment and try again.";
        } else if (res.status === 400) {
          message = "Please double-check your details and try again.";
        }
        try {
          const data = (await res.json()) as { message?: string };
          if (data?.message) message = data.message;
        } catch {
          // ignore non-JSON body
        }
        setError(message);
        setLoading(false);
        return;
      }

      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      if (loginRes.ok) {
        router.push("/research");
        router.refresh();
        return;
      }

      router.push("/sign-in?registered=1");
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
      setLoading(false);
    }
  };

  const errorId = "signup-error";
  const strengthId = "signup-strength";
  const segments: Array<{ active: boolean; tone: Strength["tone"] }> = [
    { active: strength.score >= 1, tone: strength.tone },
    { active: strength.score >= 2, tone: strength.tone },
    { active: strength.score >= 3, tone: strength.tone },
  ];

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
        <label htmlFor="signup-name" className="auth__label">
          Name
        </label>
        <input
          id="signup-name"
          name="name"
          type="text"
          className="auth__input"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={loading}
          placeholder="Ada Lovelace"
        />
      </div>

      <div className="auth__field">
        <label htmlFor="signup-email" className="auth__label">
          Email
        </label>
        <input
          id="signup-email"
          name="email"
          type="email"
          className="auth__input"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          inputMode="email"
          placeholder="you@example.com"
        />
      </div>

      <div className="auth__field">
        <label htmlFor="signup-password" className="auth__label">
          Password
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          className="auth__input"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          aria-describedby={strengthId}
          placeholder="At least 8 characters"
        />
        <div className="auth__strength" id={strengthId} aria-live="polite">
          <div className="auth__strength-bar" aria-hidden="true">
            {segments.map((seg, i) => (
              <span
                key={i}
                className={
                  "auth__strength-seg" +
                  (seg.active ? ` is-on--${seg.tone}` : "")
                }
              />
            ))}
          </div>
          <div className="auth__strength-label">
            <span>
              8+ chars &middot; a letter &middot; a digit
            </span>
            <strong>{strength.label}</strong>
          </div>
        </div>
      </div>

      <button
        type="submit"
        className="submit-button"
        disabled={!canSubmit}
        aria-busy={loading}
        aria-label={
          loading ? "Creating your account, please wait" : "Create account"
        }
      >
        {loading ? (
          <>
            <span className="submit-spinner" aria-hidden="true" />
            <span>Creating account…</span>
          </>
        ) : (
          <span>Create account</span>
        )}
      </button>
    </form>
  );
};

export default SignUpForm;
