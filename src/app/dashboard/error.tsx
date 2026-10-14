"use client"; // Error boundaries must be Client Components

import { ErrorPanel } from "@/components/ErrorPanel";

/** A page inside the dashboard failed: keep the sidebar, explain, offer Try again. */
export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorPanel error={error} retry={retry} />;
}
