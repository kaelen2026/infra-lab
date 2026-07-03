import { AbilityConstant, UIAbility, Want } from "@kit.AbilityKit";
import { window } from "@kit.ArkUI";
import { hilog } from "@kit.PerformanceAnalysisKit";
import { applyTheme, getInitialTheme, ThemeMode } from "../common/theme";

const DOMAIN: number = 0x0001;
const TAG: string = "EntryAbility";

export default class EntryAbility extends UIAbility {
  onCreate(_want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(DOMAIN, TAG, "onCreate");
    // Apply the persisted theme before the first paint so there's no light/dark flash.
    void this.applyPersistedTheme();
  }

  private async applyPersistedTheme(): Promise<void> {
    try {
      const theme: ThemeMode = await getInitialTheme(this.context);
      applyTheme(this.context, theme);
    } catch (err) {
      hilog.error(DOMAIN, TAG, "theme init failed: %{public}s", JSON.stringify(err));
    }
  }

  onDestroy(): void {
    hilog.info(DOMAIN, TAG, "onDestroy");
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    // Load the in-app brand splash first (it hands off to pages/AuthPage via router).
    // The persisted theme is already applied in onCreate, so this stays flash-free.
    windowStage.loadContent("pages/SplashPage", (err) => {
      if (err.code) {
        hilog.error(DOMAIN, TAG, "loadContent failed: %{public}s", JSON.stringify(err));
        return;
      }
      hilog.info(DOMAIN, TAG, "loadContent succeeded");
    });
  }

  onWindowStageDestroy(): void {
    hilog.info(DOMAIN, TAG, "onWindowStageDestroy");
  }
}
