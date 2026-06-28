import React, { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { SignUpForm } from "../../../src/components/auth/SignUpForm";

export const metadata: Metadata = {
  title: "Create account",
  description:
    "Create your Chronicle account to save research and collaborate with your team.",
};

export default function SignUpPage() {
  return (
    <>
      <h1 className="auth__title">Create your Chronicle account</h1>
      <p className="auth__sub">
        Save your research, share with your team, pick up where you left off.
      </p>

      <Suspense fallback={null}>
        <SignUpForm />
      </Suspense>

      <p className="auth__footer-links">
        Already have an account?
        <Link href="/sign-in">Sign in</Link>
      </p>
    </>
  );
}
