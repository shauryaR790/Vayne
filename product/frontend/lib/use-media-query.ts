"use client";

import { useEffect, useState } from "react";

/** True when viewport is `lg` (1024px) or wider. Defaults false until mounted. */
export function useIsLgUp() {
  const [isLgUp, setIsLgUp] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsLgUp(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return isLgUp;
}
