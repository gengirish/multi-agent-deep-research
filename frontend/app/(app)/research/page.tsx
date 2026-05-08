import React, { Suspense } from "react";
import { ResearchPage } from "../../../src/views/research/ResearchPage";
import { PageSkeleton } from "../../../src/components/Skeleton";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading research console…" />}>
      <ResearchPage />
    </Suspense>
  );
}
