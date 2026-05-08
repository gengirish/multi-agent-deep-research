"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./Breadcrumbs.css";

const SEGMENT_LABELS: Record<string, string> = {
  research: "Research",
  history: "History",
  visualizations: "Visualizations",
  settings: "Settings",
  about: "About",
  r: "Shared Report",
};

function labelFor(segment: string, index: number, segments: string[]): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  // Dynamic segment (e.g. session id) — show short slug
  const parent = segments[index - 1];
  if (parent === "history" || parent === "r") {
    return `Session ${segment.slice(0, 6)}`;
  }
  return segment;
}

export const Breadcrumbs: React.FC = () => {
  const pathname = usePathname() ?? "/";
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  // Build cumulative paths
  const crumbs = segments.map((segment, index) => {
    const href = "/" + segments.slice(0, index + 1).join("/");
    const label = labelFor(segment, index, segments);
    const isLast = index === segments.length - 1;
    return { segment, href, label, isLast };
  });

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol className="breadcrumbs__list">
        <li className="breadcrumbs__item">
          <Link href="/" className="breadcrumbs__link">
            Chronicle
          </Link>
        </li>
        {crumbs.map((c) => (
          <li className="breadcrumbs__item" key={c.href}>
            <span className="breadcrumbs__sep" aria-hidden="true">
              ›
            </span>
            {c.isLast ? (
              <span className="breadcrumbs__current" aria-current="page">
                {c.label}
              </span>
            ) : (
              <Link href={c.href} className="breadcrumbs__link">
                {c.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};
