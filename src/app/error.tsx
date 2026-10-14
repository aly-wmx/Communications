"use client"; // Error boundaries must be Client Components

import { ErrorPanel } from "@/components/ErrorPanel";

/** Catches what dashboard/error.tsx can't: a failure in the dashboard layout itself (the sidebar). */
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="min-h-screen bg-[#F5F3EE] px-4 py-10">
      <ErrorPanel error={error} retry={retry} />
    </main>
  );
}
