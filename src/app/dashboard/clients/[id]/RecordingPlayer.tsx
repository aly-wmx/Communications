"use client";

import { useState } from "react";

/** Loads a voicemail/call recording only when asked, so opening a thread doesn't fetch every recording. */
export function RecordingPlayer({ messageId, label = "Play" }: { messageId: string; label?: string }) {
  const [state, setState] = useState<"idle" | "open" | "missing">("idle");

  if (state === "missing") return <span className="text-[11px] text-zinc-400">No recording</span>;
  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={() => setState("open")}
        className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-[#1C2B47] shadow-sm hover:bg-white"
      >
        ▶ {label}
      </button>
    );
  }
  return (
    <audio
      controls
      autoPlay
      preload="auto"
      src={`/api/recordings/${encodeURIComponent(messageId)}`}
      onError={() => setState("missing")}
      className="h-8 w-64 max-w-full"
    >
      Your browser can&apos;t play this recording.
    </audio>
  );
}
