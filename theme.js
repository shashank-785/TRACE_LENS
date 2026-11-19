"use strict";

(() => {
  const storageKey = "trace-lens-theme";

  function readTheme() {
    try {
      return localStorage.getItem(storageKey) === "light" ? "light" : "dark";
    } catch (error) {
      console.warn("TRACE LENS could not read the saved theme preference.", error);
      return "dark";
    }
  }

  function applyTheme(theme, persist = false) {
    document.documentElement.dataset.theme = theme;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = theme === "light" ? "#f5f3fb" : "#090611";

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      const nextTheme = theme === "light" ? "dark" : "light";
      button.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
      button.title = `Switch to ${nextTheme} mode`;
      button.setAttribute("aria-pressed", String(theme === "light"));
      button.querySelector("[data-theme-icon]").textContent = theme === "light" ? "☾" : "☼";
      button.querySelector("[data-theme-label]").textContent = `${nextTheme} mode`;
    });

    if (persist) {
      try {
        localStorage.setItem(storageKey, theme);
      } catch (error) {
        console.warn("TRACE LENS could not save the theme preference.", error);
      }
    }
  }

  const initialTheme = readTheme();
  document.documentElement.dataset.theme = initialTheme;
  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(initialTheme);
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
        applyTheme(nextTheme, true);
      });
    });
  });
})();
