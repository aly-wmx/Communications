"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** "Someone else's": pick a teammate to see only their cards. */
export function PersonFilter({ team, value }: { team: Array<{ id: string; name: string }>; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <select
      aria-label="Show one person's cards"
      value={value}
      onChange={(e) => {
        const p = new URLSearchParams(params.toString());
        p.delete("t");
        if (e.target.value) p.set("who", e.target.value);
        else p.delete("who");
        router.push(`${pathname}${p.size ? `?${p}` : ""}`);
      }}
      className="min-h-9 rounded-md border border-zinc-200 bg-white px-2 text-base text-zinc-700 sm:text-sm"
    >
      <option value="">Someone else…</option>
      {team.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
