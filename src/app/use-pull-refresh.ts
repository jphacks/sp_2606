"use client";

import { useEffect, useRef, useState } from "react";

export function usePullRefresh(
  enabled: boolean,
  onRefresh: () => Promise<void>,
) {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const callback = useRef(onRefresh);
  callback.current = onRefresh;
  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number } | null = null;
    let pull = 0;
    let rawDistance = 0;
    let dragged = false;
    let running = false;
    document.documentElement.classList.add("pull-refresh-enabled");
    function reset() {
      start = null;
      pull = 0;
      rawDistance = 0;
      setDistance(0);
    }
    function begin(event: TouchEvent) {
      if (
        running ||
        event.touches.length !== 1 ||
        window.scrollY > 2 ||
        (event.target instanceof Element &&
          event.target.closest(
            "textarea, select, [contenteditable=true], [role=dialog], .mobile-nav",
          ))
      )
        return;
      dragged = false;
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
    function move(event: TouchEvent) {
      if (!start) return;
      if (event.touches.length !== 1 || window.scrollY > 2) {
        reset();
        return;
      }
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (dy < -8 || (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy))) {
        reset();
        return;
      }
      rawDistance = Math.max(0, dy);
      if (dy > 8) {
        dragged = true;
        if (event.cancelable) event.preventDefault();
      }
      pull = Math.min(88, Math.max(0, dy) * 0.7);
      setDistance(pull);
    }
    function end(event: TouchEvent) {
      // Fast swipes may deliver their final position only in touchend.
      if (start && event.changedTouches.length === 1) {
        const dx = event.changedTouches[0].clientX - start.x;
        const dy = event.changedTouches[0].clientY - start.y;
        if (dy >= 0 && dy > Math.abs(dx)) rawDistance = dy;
      }
      const ready = !!start && rawDistance >= 72;
      if (ready) dragged = true;
      reset();
      if (!ready || running) return;
      running = true;
      setRefreshing(true);
      void callback.current().finally(() => {
        running = false;
        setRefreshing(false);
      });
    }
    function cancelClick(event: MouseEvent) {
      if (!dragged || event.detail === 0) return;
      event.preventDefault();
      event.stopPropagation();
      dragged = false;
    }
    document.addEventListener("click", cancelClick, true);
    document.addEventListener("touchstart", begin, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", reset);
    return () => {
      document.documentElement.classList.remove("pull-refresh-enabled");
      document.removeEventListener("click", cancelClick, true);
      document.removeEventListener("touchstart", begin);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", reset);
    };
  }, [enabled]);
  return { distance, refreshing };
}
