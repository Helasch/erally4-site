"use client";

import { useEffect, useRef } from "react";

/** Fait défiler le bandeau des spéciales pour centrer la spéciale affichée (utile sur mobile). */
export default function StripScroll({ current }: { current: number | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const list = ref.current?.closest(".stage-strip")?.querySelector("ol");
    const active = list?.querySelector<HTMLElement>("li.active");
    if (!list || !active) return;
    list.scrollLeft = active.offsetLeft - list.offsetLeft - (list.clientWidth - active.clientWidth) / 2;
  }, [current]);
  return <span ref={ref} hidden />;
}
