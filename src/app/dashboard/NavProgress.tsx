"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PageSkeleton } from "@/components/PageSkeleton";

type Progress = {
  start: () => void;
  done: () => void;
  /** A business switch is loading: the page shows the usual loading placeholder meanwhile. */
  switching: boolean;
  setSwitching: (on: boolean) => void;
};
const ProgressContext = createContext<Progress>({ start: () => {}, done: () => {}, switching: false, setSwitching: () => {} });

/** Start or end the top loading bar by hand (e.g. while switching business). */
export const useNavProgress = () => useContext(ProgressContext);

/** Never leave the bar running if a navigation is abandoned. */
const GIVE_UP_MS = 15_000;

/** Ends the bar when the URL changes. On its own, in its own Suspense, because it reads the query string. */
function UrlWatcher({ onChange }: { onChange: () => void }) {
  const here = `${usePathname()}?${useSearchParams().toString()}`;
  const [last, setLast] = useState(here);
  if (here !== last) {
    setLast(here);
    onChange();
  }
  return null;
}

/**
 * A thin bar across the top while the next screen loads. Next keeps the old
 * screen up during a refresh (switching business) and when only the URL's
 * query changes (Inbox views, Board filters), so without this a click looks
 * like it did nothing. Starts on any click to another portal screen; ends
 * when the URL changes.
 */
export function NavProgress({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [switching, setSwitching] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const done = useCallback(() => {
    window.clearTimeout(timer.current);
    setActive(false);
  }, []);
  const start = useCallback(() => {
    window.clearTimeout(timer.current);
    setActive(true);
    timer.current = window.setTimeout(() => setActive(false), GIVE_UP_MS);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith("/dashboard")) return;
      // Same screen (or only a #section link): nothing to load.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.clearTimeout(timer.current);
    };
  }, [start]);

  // Stable functions, so components that end the bar (the business switcher) don't re-run on every bar change.
  const value = useMemo(() => ({ start, done, switching, setSwitching }), [start, done, switching]);

  return (
    <ProgressContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <UrlWatcher onChange={done} />
      </Suspense>
      <div aria-hidden className={`pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden transition-opacity ${active ? "opacity-100" : "opacity-0"}`}>
        <div className="nav-progress h-full w-1/3 bg-gold" />
      </div>
      <span role="status" className="sr-only">
        {active ? "Loading…" : ""}
      </span>
    </ProgressContext.Provider>
  );
}

/** The page area: while a business switch loads, the usual loading placeholder instead of the previous business's data. */
export function MainContent({ children }: { children: React.ReactNode }) {
  const { switching } = useNavProgress();
  return (
    <>
      {switching && <PageSkeleton />}
      {/* Kept mounted (just hidden) so nothing reloads twice when the new business arrives. */}
      <div hidden={switching}>{children}</div>
    </>
  );
}
