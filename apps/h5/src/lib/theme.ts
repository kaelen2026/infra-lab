export type Theme = "light" | "dark";

const KEY = "infra.theme";

/** Persisted choice if present, else h5's default (dark), matching web. */
export function getInitialTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  return saved === "light" || saved === "dark" ? saved : "dark";
}

/** Toggle `.dark` on <html> and persist the choice. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem(KEY, theme);
}
