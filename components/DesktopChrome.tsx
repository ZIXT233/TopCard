"use client";

import { useEffect, useState } from "react";

export function DesktopChrome() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const bridge = (window as Window & { topcardDesktop?: { platform?: string; setWindowTheme?: (dark: boolean) => void } }).topcardDesktop;
    if (!bridge) return;
    setDesktop(true);
    document.documentElement.classList.add("topcard-desktop");
    document.documentElement.dataset.desktopPlatform = bridge.platform;
    const sync = () => bridge.setWindowTheme?.(document.documentElement.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => { observer.disconnect(); document.documentElement.classList.remove("topcard-desktop"); delete document.documentElement.dataset.desktopPlatform; };
  }, []);
  return desktop ? <div className="desktop-window-chrome" aria-hidden="true" /> : null;
}
