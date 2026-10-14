import Link from "next/link";

/** A client, item or page that no longer exists (deleted, or an old link). */
export default function DashboardNotFound() {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
      <p className="text-base font-semibold text-zinc-900">That isn&apos;t here anymore</p>
      <p className="mt-2 text-sm text-zinc-600">It may have been deleted, or the link is out of date.</p>
      <Link
        href="/dashboard/inbox"
        className="mt-5 inline-block rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-hover"
      >
        Back to Inbox
      </Link>
    </div>
  );
}
