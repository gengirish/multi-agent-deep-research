import type { Metadata } from "next";
import React from "react";
import { AboutPage } from "../../../src/views/about/AboutPage";

export const metadata: Metadata = {
  title: "About",
};

export default function Page() {
  return <AboutPage />;
}
