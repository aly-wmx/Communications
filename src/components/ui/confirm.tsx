"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface ConfirmOptions {
  title: string;
  /** What will happen, in plain words. */
  body?: string;
  confirmLabel?: string;
  /** "danger" for things that can't be undone (red button). */
  tone?: "danger" | "default";
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

// Without the provider (e.g. a page rendered outside the dashboard), fall back to the browser's own box.
const ConfirmContext = createContext<Confirm>(async (o) => window.confirm([o.title, o.body].filter(Boolean).join("\n\n")));

/** `const confirm = useConfirm(); if (await confirm({ title: "Delete this?" })) …` */
export const useConfirm = () => useContext(ConfirmContext);

/**
 * One accessible confirmation dialog for the whole dashboard. Built on <dialog>,
 * which traps focus and closes on Escape. It opens with Cancel focused, so a stray
 * Enter never does the destructive thing.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolve = useRef<((ok: boolean) => void) | undefined>(undefined);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  const confirm = useCallback<Confirm>(
    (o) =>
      new Promise<boolean>((done) => {
        resolve.current?.(false);
        resolve.current = done;
        setOptions(o);
      }),
    [],
  );

  useEffect(() => {
    if (!options) return;
    dialog.current?.showModal();
    cancelButton.current?.focus();
  }, [options]);

  const finish = (ok: boolean) => {
    resolve.current?.(ok);
    resolve.current = undefined;
    dialog.current?.close();
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={options?.body ? bodyId : undefined}
        onCancel={(e) => {
          e.preventDefault();
          finish(false);
        }}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-zinc-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
      >
        {options && (
          <div className="p-5">
            <h2 id={titleId} className="text-base font-semibold text-zinc-900">
              {options.title}
            </h2>
            {options.body && (
              <p id={bodyId} className="mt-2 text-sm text-zinc-600">
                {options.body}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                ref={cancelButton}
                type="button"
                onClick={() => finish(false)}
                className="min-h-10 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:border-zinc-400 sm:min-h-9"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => finish(true)}
                className={cn(
                  "min-h-10 rounded-md px-4 text-sm font-semibold text-white sm:min-h-9",
                  options.tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-navy hover:bg-navy-hover",
                )}
              >
                {options.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}
