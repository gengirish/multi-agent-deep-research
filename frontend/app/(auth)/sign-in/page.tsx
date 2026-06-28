import React, { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { SignInForm } from "../../../src/components/auth/SignInForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Chronicle account.",
};

export default function SignInPage() {
  return (
    <>
      <h1 className="auth__title">Sign in to Chronicle</h1>
      <p className="auth__sub">Welcome back. Continue your research.</p>

      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>

      <p className="auth__footer-links">
        Don&apos;t have an account?
        <Link href="/sign-up">Sign up</Link>
      </p>
    </>
  );
}
