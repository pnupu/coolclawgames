"use client";

import { useState, useEffect } from "react";

type ThemeName = "default" | "terminal" | "colosseum" | "arcade" | "ritual" | "blueprint";

const THEMES: { id: ThemeName; name: string; icon: string; description: string }[] = [
  { id: "default", name: "Default", icon: "🌙", description: "Original dark theme" },
  { id: "terminal", name: "Terminal", icon: "💻", description: "Retro CRT command center" },
  { id: "colosseum", name: "Colosseum", icon: "🏛️", description: "Luxury editorial Roman" },
  { id: "arcade", name: "Arcade", icon: "🕹️", description: "Maximalist neon chaos" },
  { id: "ritual", name: "Ritual", icon: "🕯️", description: "Dark fantasy gothic" },
  { id: "blueprint", name: "Blueprint", icon: "📐", description: "Industrial brutalist" },
];

function applyTheme(themeName: ThemeName) {
  // Apply to html element
  document.documentElement.setAttribute("data-theme", themeName);
  // Also apply to body as backup
  document.body.setAttribute("data-theme", themeName);
  // Force a style recalculation
  document.documentElement.style.colorScheme = themeName === "default" ? "dark" : "dark";
  console.log("Theme applied:", themeName, "- data-theme is now:", document.documentElement.getAttribute("data-theme"));
}

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeName>("default");
  const [mounted, setMounted] = useState(false);

  // Load theme from localStorage on mount
  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem("coolclaw-theme") as ThemeName | null;
      if (stored && THEMES.some((t) => t.id === stored)) {
        setTheme(stored);
        applyTheme(stored);
      } else {
        applyTheme("default");
      }
    } catch (e) {
      console.error("Error loading theme:", e);
      applyTheme("default");
    }
  }, []);

  // Apply theme when it changes
  const handleThemeChange = (newTheme: ThemeName) => {
    console.log("Changing theme to:", newTheme);
    setTheme(newTheme);
    applyTheme(newTheme);
    try {
      localStorage.setItem("coolclaw-theme", newTheme);
    } catch (e) {
      console.error("Error saving theme:", e);
    }
  };

  // Don't render until mounted to avoid hydration mismatch
  if (!mounted) {
    return null;
  }

  const currentTheme = THEMES.find((t) => t.id === theme);

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        padding: "16px",
        background: "rgba(0, 0, 0, 0.9)",
        border: "2px solid rgba(255, 255, 255, 0.2)",
        borderRadius: "12px",
        backdropFilter: "blur(12px)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
        maxWidth: "360px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "14px",
          fontWeight: 700,
          color: "#fff",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        <span style={{ fontSize: "20px" }}>{currentTheme?.icon}</span>
        <span>Theme: {currentTheme?.name}</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "8px",
        }}
      >
        {THEMES.map((t) => {
          const isActive = theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleThemeChange(t.id)}
              title={t.description}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                padding: "12px 8px",
                background: isActive ? "#ffffff" : "rgba(255, 255, 255, 0.1)",
                border: isActive ? "2px solid #ffffff" : "1px solid rgba(255, 255, 255, 0.3)",
                borderRadius: "8px",
                cursor: "pointer",
                color: isActive ? "#000000" : "#ffffff",
                fontSize: "11px",
                fontWeight: 600,
                transition: "all 0.15s ease",
                outline: "none",
              }}
            >
              <span style={{ fontSize: "22px", lineHeight: 1 }}>{t.icon}</span>
              <span>{t.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
