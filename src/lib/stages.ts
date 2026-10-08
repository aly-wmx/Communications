/** The Watermark client journey, and which department looks after each stage. */

export const STAGES = [
  "New Lead",
  "Feasibility & Vision Mapping",
  "Architectural & Design Studio",
  "Pre-Production & Permitting",
  "Active Construction",
  "Client Care & Warranty",
  "Lost Lead",
  "Archive",
  "Legacy",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_STYLE: Record<Stage, string> = {
  "New Lead": "bg-sky-100 text-sky-900",
  "Feasibility & Vision Mapping": "bg-indigo-100 text-indigo-900",
  "Architectural & Design Studio": "bg-violet-100 text-violet-900",
  "Pre-Production & Permitting": "bg-amber-100 text-amber-900",
  "Active Construction": "bg-orange-100 text-orange-900",
  "Client Care & Warranty": "bg-emerald-100 text-emerald-900",
  "Lost Lead": "bg-zinc-200 text-zinc-700",
  Archive: "bg-zinc-200 text-zinc-700",
  Legacy: "bg-stone-200 text-stone-800",
};

export const DEPARTMENTS = {
  sales: { label: "Sales", stages: ["New Lead", "Feasibility & Vision Mapping"] },
  design: { label: "Design", stages: ["Architectural & Design Studio", "Pre-Production & Permitting"] },
  construction: { label: "Construction", stages: ["Active Construction"] },
  client_care: { label: "Client Care", stages: ["Client Care & Warranty"] },
} as const satisfies Record<string, { label: string; stages: readonly Stage[] }>;
export type Department = keyof typeof DEPARTMENTS;

export function isStage(v: unknown): v is Stage {
  return typeof v === "string" && (STAGES as readonly string[]).includes(v);
}

export function isDepartment(v: unknown): v is Department {
  return typeof v === "string" && v in DEPARTMENTS;
}

/** Stages a department sees by default. Clients with no stage yet show to Sales (they're usually new). */
export function departmentStages(d: Department): readonly Stage[] {
  return DEPARTMENTS[d].stages;
}

export function departmentFor(stage: Stage | null | undefined): Department | null {
  if (!stage) return "sales";
  for (const [key, d] of Object.entries(DEPARTMENTS)) if ((d.stages as readonly string[]).includes(stage)) return key as Department;
  return null;
}

/** The tag mirrored onto the contact in GoHighLevel. */
export const stageTag = (stage: Stage) => `Stage: ${stage}`;
