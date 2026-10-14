import { cn } from "@/lib/utils";

/** The white panel used across the portal. `title` adds a heading row. */
export function Card({
  title,
  action,
  className,
  children,
  as: Tag = "section",
}: {
  title?: string;
  /** Shown at the right of the heading row (a link or small button). */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag className={cn("rounded-xl border border-zinc-200 bg-white shadow-sm", className)}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </Tag>
  );
}
