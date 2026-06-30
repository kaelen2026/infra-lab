import { AbilityConstant, UIAbility, Want } from "@kit.AbilityKit";
import { window } from "@kit.ArkUI";
import { hilog } from "@kit.PerformanceAnalysisKit";

const DOMAIN: number = 0x0001;
const TAG: string = "EntryAbility";

export default class EntryAbility extends UIAbility {
  onCreate(_want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(DOMAIN, TAG, "onCreate");
  }

  onDestroy(): void {
    hilog.info(DOMAIN, TAG, "onDestroy");
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent("pages/AuthPage", (err) => {
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
