"use client";

import { ConfirmProvider } from "@/components/ui/confirm";
import { NavProgress } from "./NavProgress";
import { ToastProvider } from "@/components/ui/toast";

/** Dashboard-wide client helpers: the top loading bar, the confirmation dialog and action toasts. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <NavProgress>{children}</NavProgress>
      </ConfirmProvider>
    </ToastProvider>
  );
}
