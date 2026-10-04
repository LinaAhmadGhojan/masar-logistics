"use client";

import { Suspense } from "react";
import { Shell } from "@/components/Shell";
import { Loading } from "@/components/ui";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </Shell>
  );
}
