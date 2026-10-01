import { PageHeader } from "./PageHeader";

/** Placeholder for sections built in a later phase, so the sidebar shows the whole portal from day one. */
export function ComingSoon({
  title,
  description,
  phase,
  features,
}: {
  title: string;
  description: string;
  phase: number;
  features: string[];
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <div className="max-w-2xl rounded-lg border border-dashed border-zinc-300 bg-white p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#B08D57]">Coming in phase {phase}</p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-zinc-700">
          {features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
