import React, { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ResetPasswordForm } from "../../../src/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Set a new password",
  description: "Choose a new password for your Chronicle account.",
};

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="auth__title">Set a new password</h1>
      <p className="auth__sub">
        Pick something you&apos;ll remember &mdash; you&apos;ll use it next
        time you sign in.
      </p>

      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>

      <p className="auth__footer-links">
        Changed your mind?
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </>
  );
}
