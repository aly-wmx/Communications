import { cn } from "@/lib/utils";

export type PillTone = "danger" | "warning" | "success" | "neutral" | "brand" | "solid-danger";

const TONES: Record<PillTone, string> = {
  danger: "bg-red-50 text-red-700",
  warning: "bg-amber-50 text-amber-800",
  success: "bg-emerald-50 text-emerald-800",
  neutral: "bg-zinc-100 text-zinc-700",
  brand: "bg-gold/10 text-gold-ink",
  "solid-danger": "bg-red-600 text-white",
};

/**
 * A short status label. Always words, never colour alone ("Overdue", not just red),
 * so it reads the same for everyone.
 */
export function StatusPill({ tone = "neutral", className, children }: { tone?: PillTone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}
