// WMX's own mark, not a logo image asset (none exists yet) — matches the
// "small uppercase kicker + bold heading" language already established in
// the WMX brand deck and the earlier wmx-recap.jsx / social-media-tracker.jsx
// artifacts, rather than borrowing a third-party component's branding.
export function WmxWordmark({
  variant = "dark",
  className,
}: {
  variant?: "light" | "dark";
  className?: string;
}) {
  const kicker = variant === "light" ? "text-[#D8B378]" : "text-[#B08D57]";
  const heading = variant === "light" ? "text-white" : "text-[#232019]";

  return (
    <div className={className}>
      <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${kicker}`}>
        WMX Management Group
      </p>
      <p className={`text-sm font-bold ${heading}`}>Client Communications</p>
    </div>
  );
}
