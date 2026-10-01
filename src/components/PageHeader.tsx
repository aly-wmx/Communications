export function PageHeader({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600">{description}</p>
      </div>
      {children}
    </div>
  );
}
