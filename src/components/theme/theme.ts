/**
 * Light / dark / system appearance, remembered per browser.
 *
 * The choice is stored in localStorage and applied as data-theme on <html>.
 * "system" removes the attribute so the CSS follows the device setting
 * (see the dark-mode rules in globals.css). Storage can be unavailable
 * (private browsing, blocked site data), so every access is guarded.
 */
export type ThemeChoice = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "beamhaven-theme";

export function parseTheme(value: unknown): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

export function readStoredTheme(): ThemeChoice {
  try {
    return parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
}

/**
 * Runs before the page paints (inlined in <head>), so a saved dark theme
 * never flashes light first. Kept tiny and dependency-free on purpose.
 */
export const themeBootScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}})();`;
