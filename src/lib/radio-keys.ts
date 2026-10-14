import type { KeyboardEvent } from "react";

/**
 * Arrow keys for a custom role="radiogroup" (put it on the group's onKeyDown):
 * like native radio buttons, arrows move the choice and the focus together.
 * Pair with tabIndex={checked ? 0 : -1} on each radio, so Tab enters the group once.
 */
export function onRadioKeys<T>(e: KeyboardEvent<HTMLElement>, options: readonly T[], current: T, choose: (value: T) => void) {
  const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
  if (!step || !options.length) return;
  e.preventDefault();
  const at = Math.max(0, options.indexOf(current));
  const next = options[(at + step + options.length) % options.length];
  choose(next);
  const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not([disabled])')];
  radios[options.indexOf(next)]?.focus();
}
