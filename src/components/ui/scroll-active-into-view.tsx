"use client";

import { useEffect, useRef } from "react";

/**
 * Drop inside a horizontally scrolling container: scrolls the child marked
 * aria-current="page" into view (phones only show a few tabs at a time).
 */
export function ScrollActiveIntoView() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const scroller = ref.current?.parentElement;
    const active = scroller?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!scroller || !active) return;
    const a = active.getBoundingClientRect();
    const b = scroller.getBoundingClientRect();
    const left = scroller.scrollLeft + (a.left - b.left) - (b.width - a.width) / 2;
    scroller.scrollTo({ left: Math.max(0, left) });
  });
  return <span ref={ref} hidden />;
}
