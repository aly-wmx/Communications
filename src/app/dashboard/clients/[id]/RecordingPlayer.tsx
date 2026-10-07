"use client";

import { useState } from "react";

/** Loads a voicemail/call recording only when asked, so opening a thread doesn't fetch every recording. */
export function RecordingPlayer({ messageId, label = "Play" }: { messageId: string; label?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [problem, setProblem] = useState("");
  const src = `/api/recordings/${encodeURIComponent(messageId)}`;

  // The audio element only says "error"; ask the server for the actual reason.
  async function explain() {
    setState("error");
    try {
      const res = await fetch(src, { headers: { Range: "bytes=0-0" } });
      setProblem(res.ok || res.status === 206 ? "Your browser couldn't play this audio format." : await res.text());
    } catch {
      setProblem("Couldn't reach the recording.");
    }
  }

  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={() => setState("loading")}
        className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-[#1C2B47] shadow-sm hover:bg-white"
      >
        ▶ {label}
      </button>
    );
  }
  if (state === "error") {
    return <span className="text-[11px] text-zinc-500">{problem || "Checking…"}</span>;
  }
  return (
    <span className="flex items-center gap-2">
      {state === "loading" && <span className="text-[11px] text-zinc-500">Loading…</span>}
      <audio
        controls
        autoPlay
        preload="auto"
        src={src}
        onCanPlay={() => setState("ready")}
        onError={() => void explain()}
        className="h-8 w-64 max-w-full"
      >
        Your browser can&apos;t play this recording.
      </audio>
    </span>
  );
}
