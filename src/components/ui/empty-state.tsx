import type { LucideIcon } from "lucide-react";

/** What a list shows when it has nothing in it: what that means, and what to do next. */
export function EmptyState({ icon: Icon, title, body, action }: { icon?: LucideIcon; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {Icon && <Icon aria-hidden className="mb-3 size-8 text-zinc-400" />}
      <p className="text-sm font-semibold text-zinc-900">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-zinc-600">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
