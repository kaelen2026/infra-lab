import { common, ConfigurationConstant } from "@kit.AbilityKit";
import { preferences } from "@kit.ArkData";

/**
 * Two-way light/dark theme, mirroring web/h5 (`apps/h5/src/lib/theme.ts`). Harmony has
 * no manual toggle in the platform UI, so we drive it explicitly: the choice is persisted
 * in Preferences and applied by forcing the app's color mode. ArkUI then resolves every
 * `$r('app.color.*')` reference against the matching resource set (`resources/base` for
 * light, `resources/dark` for dark) — no per-widget color logic needed.
 */
export type ThemeMode = "light" | "dark";

const PREFS_STORE: string = "infra_auth";
const THEME_KEY: string = "app.theme";

/**
 * Persisted choice if present, else the shared default (dark) — matching web/h5, whose
 * default is the warm-charcoal dark palette.
 */
export async function getInitialTheme(context: common.Context): Promise<ThemeMode> {
  const store: preferences.Preferences = await preferences.getPreferences(context, PREFS_STORE);
  const saved: string = (await store.get(THEME_KEY, "dark")) as string;
  return saved === "light" ? "light" : "dark";
}

/** Force the app-wide color mode so the matching color resource set becomes active. */
export function applyTheme(context: common.Context, theme: ThemeMode): void {
  const mode: ConfigurationConstant.ColorMode =
    theme === "dark"
      ? ConfigurationConstant.ColorMode.COLOR_MODE_DARK
      : ConfigurationConstant.ColorMode.COLOR_MODE_LIGHT;
  context.getApplicationContext().setColorMode(mode);
}

/** Persist the chosen theme so the next launch (and the auth page) honors it. */
export async function persistTheme(context: common.Context, theme: ThemeMode): Promise<void> {
  const store: preferences.Preferences = await preferences.getPreferences(context, PREFS_STORE);
  await store.put(THEME_KEY, theme);
  await store.flush();
}
