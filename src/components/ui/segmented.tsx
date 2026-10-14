import Link from "next/link";
import { cn } from "@/lib/utils";

export interface SegmentItem {
  href: string;
  label: React.ReactNode;
  current: boolean;
  /** Small count after the label; `alert` makes it red. */
  count?: number;
  alert?: boolean;
}

/** A row of view tabs that are links (views live in the URL, so they're shareable and work without JS). */
export function SegmentedLinks({ items, label, className }: { items: SegmentItem[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("flex flex-wrap gap-0.5 rounded-lg border border-zinc-200 bg-white p-0.5 text-sm", className)}>
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          aria-current={it.current ? "page" : undefined}
          className={cn(
            "inline-flex min-h-9 items-center rounded-md px-3 sm:min-h-0 sm:py-1",
            it.current ? "bg-gold/7 font-semibold text-navy" : "text-zinc-600 hover:text-zinc-900",
          )}
        >
          {it.label}
          {it.count !== undefined && (
            <span className={cn("ml-1.5 text-xs tabular-nums", it.alert && it.count ? "font-semibold text-red-600" : "text-zinc-500")}>{it.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
