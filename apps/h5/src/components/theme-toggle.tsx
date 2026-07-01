import { Moon, Sun } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { applyTheme, getInitialTheme, type Theme } from "@/lib/theme";

/** Flip between the warm-charcoal dark theme and the warm-paper light theme. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <Button variant="ghost" size="icon" aria-label="切换明暗主题" onClick={toggle}>
      {/* CSS-driven glyph swap keyed off the `.dark` class the toggle just set. */}
      <Sun className="hidden size-4 dark:block" />
      <Moon className="block size-4 dark:hidden" />
    </Button>
  );
}
