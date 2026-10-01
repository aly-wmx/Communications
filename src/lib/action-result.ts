// Shared by every module's server actions — see the Reliability section of
// docs/architecture.md: nothing fails silently, every write returns a typed
// success/failure result instead of throwing to an error boundary.
export type ActionResult = { ok: true } | { ok: false; error: string };
