"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "error";
interface Item {
  id: number;
  message: string;
  tone: Tone;
}
type Notify = (message: string, tone?: Tone) => void;

const ToastContext = createContext<Notify>(() => {});

/** `const toast = useToast(); toast("Assigned to Reid")`: a short confirmation that an action worked. */
export const useToast = () => useContext(ToastContext);

let nextId = 1;

/**
 * Confirmations for your own actions ("Saved", "Assigned to Reid"). Separate from
 * the live client alerts, and placed where those aren't: top centre on phones,
 * bottom left on larger screens.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const notify = useCallback<Notify>((message, tone = "success") => {
    const id = nextId++;
    setItems((list) => [...list.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), tone === "error" ? 8000 : 4000);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 top-16 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-4 sm:left-4 sm:top-auto sm:items-start lg:left-64"
      >
        {items.map((t) => (
          <p
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-medium shadow-lg",
              t.tone === "error" ? "bg-red-700 text-white" : "bg-navy text-white",
            )}
          >
            {t.tone === "error" ? <CircleAlert aria-hidden className="size-4" /> : <CheckCircle2 aria-hidden className="size-4" />}
            {t.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
