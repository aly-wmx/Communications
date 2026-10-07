"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * One sidebar for every screen size: a fixed column on large screens, a
 * slide-out drawer behind a ☰ button on phones and tablets. Rendering the
 * contents once keeps a single live-alerts connection.
 */
export function SidebarShell({ brand, children }: { brand: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer after navigating.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2.5 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="grid size-9 place-items-center rounded-md border border-zinc-200 text-lg text-zinc-700"
        >
          ☰
        </button>
        {brand}
      </header>

      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-zinc-200 bg-white transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-60 lg:translate-x-0 ${
          open ? "translate-x-0 shadow-xl" : "-translate-x-full"
        }`}
        aria-label="Main menu"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-4">
          {brand}
          <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="text-xl text-zinc-400 hover:text-zinc-700 lg:hidden">
            ×
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
