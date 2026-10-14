"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { UNREAD_EVENT } from "./NotificationBell";

/** Below Tailwind's lg breakpoint the sidebar is a drawer. */
const DRAWER_QUERY = "(max-width: 1023.98px)";
const subscribeWidth = (cb: () => void) => {
  const mq = window.matchMedia(DRAWER_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/**
 * One sidebar for every screen size: a fixed column on large screens, a
 * slide-out drawer behind a ☰ button on phones and tablets. Rendering the
 * contents once keeps a single live-alerts connection. On phones the header
 * shows the current business and unread notifications, which otherwise only
 * live inside the drawer.
 */
export function SidebarShell({
  brand,
  businessName,
  children,
}: {
  brand: React.ReactNode;
  businessName?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const pathname = usePathname();
  const isDrawer = useSyncExternalStore(subscribeWidth, () => window.matchMedia(DRAWER_QUERY).matches, () => false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // Close the drawer after navigating.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    const onUnread = (e: Event) => setUnread((e as CustomEvent<number>).detail);
    window.addEventListener(UNREAD_EVENT, onUnread);
    return () => window.removeEventListener(UNREAD_EVENT, onUnread);
  }, []);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const opener = menuButton.current;
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      opener?.focus();
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2.5 lg:hidden">
        <button
          ref={menuButton}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Open menu${unread ? `, ${unread} unread notification${unread === 1 ? "" : "s"}` : ""}`}
          aria-expanded={open}
          className="relative grid size-10 place-items-center rounded-md border border-zinc-200 text-lg text-zinc-700"
        >
          ☰
          {unread > 0 && (
            <span aria-hidden className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-semibold leading-5 text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
        {brand}
        {businessName && <span className="ml-auto truncate text-sm font-medium text-zinc-700">{businessName}</span>}
      </header>

      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-zinc-200 bg-white transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-60 lg:translate-x-0 ${
          open ? "translate-x-0 shadow-xl" : "-translate-x-full"
        }`}
        aria-label="Main menu"
        // A closed drawer is off-screen: keep its links out of the tab order and away from screen readers.
        inert={isDrawer && !open}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-4">
          {brand}
          <button
            ref={closeButton}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="grid size-9 place-items-center text-xl text-zinc-500 hover:text-zinc-700 lg:hidden"
          >
            ×
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
