import Link from "next/link";

/** Shown instead of a blank page when no business exists yet. */
export function NoBusiness() {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
      <p className="text-base font-semibold text-zinc-900">No business is set up yet</p>
      <p className="mt-2 text-sm text-zinc-600">Clients, conversations and calls all belong to a business. An admin can add one.</p>
      <Link href="/dashboard/businesses" className="mt-5 inline-block text-sm font-semibold text-gold-ink hover:underline">
        Go to Businesses →
      </Link>
    </div>
  );
}
