import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ForgotPasswordForm } from "../../../src/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Request a password reset link for your Chronicle account.",
};

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="auth__title">Reset your password</h1>
      <p className="auth__sub">We&apos;ll send you a link to reset it.</p>

      <ForgotPasswordForm />

      <p className="auth__footer-links">
        Remembered it?
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </>
  );
}
