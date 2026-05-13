"use client";

import { useEffect, useState } from "react";

// Reusable typewriter hook. Reveals `text` one character at a time and
// returns the current visible slice plus a `done` flag. The interval is
// cleared whenever the text changes mid-flight so swapping the input
// resets the animation cleanly.
export function useTypewriter(text: string, speed = 18) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed("");
    setDone(false);
    if (!text) { setDone(true); return; }
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(interval); setDone(true); }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);
  return { displayed, done };
}
