"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icon";

const storageKey = "world-theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    function syncTheme() {
      let next: "light" | "dark" = "light";
      try {
        next = localStorage.getItem(storageKey) === "dark" ? "dark" : "light";
      } catch {
        next =
          document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      }
      document.documentElement.dataset.theme = next;
      setTheme(next);
    }

    syncTheme();
    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);

  function toggleTheme() {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // The active tab can still use the selected theme when storage is blocked.
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle icon-button"
      aria-label={theme === "dark" ? "切换到浅色模式" : "切换到暗黑模式"}
      aria-pressed={theme === "dark"}
      title={theme === "dark" ? "浅色模式" : "暗黑模式"}
      onClick={toggleTheme}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}
