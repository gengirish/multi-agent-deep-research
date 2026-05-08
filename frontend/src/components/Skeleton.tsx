"use client";

import React from "react";
import "./Skeleton.css";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = "100%",
  height = 16,
  radius = 6,
  className,
  style,
}) => {
  return (
    <div
      className={`skeleton ${className ?? ""}`}
      style={{
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
      aria-hidden="true"
    />
  );
};

export const PageSkeleton: React.FC<{ label?: string }> = ({ label }) => {
  return (
    <div className="page-skeleton" role="status" aria-live="polite">
      {label && <span className="visually-hidden">{label}</span>}
      <Skeleton height={36} width="38%" />
      <Skeleton height={14} width="62%" style={{ marginTop: 14 }} />
      <Skeleton height={14} width="54%" style={{ marginTop: 8 }} />
      <div className="page-skeleton__grid">
        <Skeleton height={120} radius={14} />
        <Skeleton height={120} radius={14} />
        <Skeleton height={120} radius={14} />
      </div>
      <Skeleton height={220} radius={14} style={{ marginTop: 24 }} />
    </div>
  );
};

export const ResultsSkeleton: React.FC = () => {
  return (
    <div className="results-skeleton" role="status" aria-live="polite">
      <span className="visually-hidden">Compiling research report…</span>
      <div className="results-skeleton__metrics">
        <Skeleton height={88} radius={12} />
        <Skeleton height={88} radius={12} />
        <Skeleton height={88} radius={12} />
        <Skeleton height={88} radius={12} />
      </div>
      <Skeleton height={28} width="42%" style={{ marginTop: 28 }} />
      <Skeleton height={14} width="92%" style={{ marginTop: 16 }} />
      <Skeleton height={14} width="86%" style={{ marginTop: 8 }} />
      <Skeleton height={14} width="78%" style={{ marginTop: 8 }} />
      <Skeleton height={14} width="40%" style={{ marginTop: 8 }} />
      <Skeleton height={28} width="32%" style={{ marginTop: 28 }} />
      <Skeleton height={140} radius={10} style={{ marginTop: 16 }} />
    </div>
  );
};
