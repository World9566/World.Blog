"use client";

import { useEffect, useState } from "react";

const systemQuery = "(prefers-color-scheme: dark)";
type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute("content", theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const media = window.matchMedia(systemQuery);
    function syncTheme() {
      const next = media.matches ? "dark" : "light";
      applyTheme(next);
      setTheme(next);
    }

    syncTheme();
    media.addEventListener("change", syncTheme);
    return () => media.removeEventListener("change", syncTheme);
  }, []);

  function toggleTheme() {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      className="theme-toggle icon-button"
      aria-label={
        theme === "dark"
          ? "当前暗色模式，切换到浅色模式"
          : "当前浅色模式，切换到暗色模式"
      }
      aria-pressed={theme === "dark"}
      title={theme === "dark" ? "暗色模式" : "浅色模式"}
      onClick={toggleTheme}
    >
      <span className="theme-toggle-sky" aria-hidden="true">
        <span className="theme-toggle-cloud theme-toggle-cloud-back" />
        <span className="theme-toggle-cloud theme-toggle-cloud-front" />
        <span className="theme-toggle-stars" />
        <span className="theme-toggle-orb" />
      </span>
    </button>
  );
}
