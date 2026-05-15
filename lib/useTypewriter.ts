"use client";

import { useEffect, useRef, useState } from "react";

// Streaming-safe typewriter. The old version reset `displayed` to ""
// every time `text` changed — which during SSE streaming meant every
// new chunk reset the animation, producing the flicker / line-by-line
// jumping the user reported.
//
// New behavior:
//   - When the new text starts with the currently-displayed prefix
//     (the streaming case), keep `displayed` and just keep advancing.
//   - When the new text is a brand-new message (doesn't share the
//     prefix, or shrinks), reset and start over.
//
// The interval lives in a ref so each new text growth doesn't tear it
// down — it stays running, reading the latest `text` via the ref on
// every tick.
export function useTypewriter(text: string, speed = 14) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const textRef = useRef(text);
  const iRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep the latest target text in a ref so the interval sees growth
  // without restarting.
  useEffect(() => {
    const prev = textRef.current;
    textRef.current = text;

    // Detect a "new message" (text doesn't extend the prev or got shorter).
    const isContinuation = text.startsWith(prev) && text.length >= prev.length;
    if (!isContinuation) {
      // Hard reset for a new message.
      iRef.current = 0;
      setDisplayed("");
      setDone(false);
    } else if (text.length > displayed.length) {
      // More content arrived; make sure we're not flagged done.
      setDone(false);
    }

    // Empty text → instantly done.
    if (!text) {
      iRef.current = 0;
      setDisplayed("");
      setDone(true);
      return;
    }

    // Spin up the interval once. It runs until iRef catches up to
    // textRef and stays at length === text.length (idle until more
    // content arrives, in which case we clear `done` above).
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const target = textRef.current;
      if (iRef.current >= target.length) {
        setDone(true);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }
      // Advance multiple chars per tick when we're far behind the stream
      // (e.g. a big chunk just landed). Catches up smoothly without
      // looking like instant-paste.
      const behind = target.length - iRef.current;
      const step = behind > 80 ? Math.ceil(behind / 40) : behind > 20 ? 2 : 1;
      iRef.current = Math.min(target.length, iRef.current + step);
      setDisplayed(target.slice(0, iRef.current));
    }, speed);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speed]);

  return { displayed, done };
}
