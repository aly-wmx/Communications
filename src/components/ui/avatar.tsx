import { cn } from "@/lib/utils";

export function initials(name: string): string {
  const parts = name.replace(/\(.*\)/, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** A person's or client's initials in a circle. The name is for screen readers when there's no text beside it. */
export function Avatar({ name, size = "md", className, labelled = false }: { name: string; size?: "sm" | "md" | "lg"; className?: string; labelled?: boolean }) {
  const dims = size === "sm" ? "size-6 text-[10px]" : size === "lg" ? "size-10 text-sm" : "size-8 text-xs";
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full bg-navy font-bold text-white", dims, className)}
      {...(labelled ? { role: "img", "aria-label": name } : { "aria-hidden": true })}
    >
      {initials(name)}
    </span>
  );
}
