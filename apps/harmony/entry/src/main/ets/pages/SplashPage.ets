import { router } from "@kit.ArkUI";
import { hilog } from "@kit.PerformanceAnalysisKit";
import { BRAND, TAGLINE } from "../sdk/copy.generated";

const DOMAIN: number = 0x0001;
const TAG: string = "SplashPage";
/** How long the brand lockup stays on screen before handing off to the auth page. */
const SPLASH_DELAY_MS: number = 800;
/** Entrance animation duration (opacity + scale settle). */
const ENTER_DURATION_MS: number = 500;

/**
 * In-app brand splash (segment B). The system start window (segment A —
 * `startWindowIcon`/`startWindowBackground` in `module.json5`) paints first with no app
 * code; this page then fades/scales the brand lockup in and, after a short beat, hands
 * off to the auth page with `router.replaceUrl` so the splash never returns to the back
 * stack. The persisted theme is already applied in `EntryAbility.onCreate`, so this page
 * resolves `$r('app.color.*')` against the active (light/dark) set with no flash.
 */
@Entry
@Component
struct SplashPage {
  /** Drives the entrance animation (0 → 1). */
  @State private contentOpacity: number = 0;
  /** Drives the entrance animation (slightly small → full size). */
  @State private contentScale: number = 0.92;

  aboutToAppear(): void {
    void this.enterAndNavigate();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve: () => void): void => {
      setTimeout((): void => {
        resolve();
      }, ms);
    });
  }

  private async enterAndNavigate(): Promise<void> {
    animateTo({ duration: ENTER_DURATION_MS, curve: Curve.EaseOut }, (): void => {
      this.contentOpacity = 1;
      this.contentScale = 1;
    });
    await this.delay(SPLASH_DELAY_MS);
    try {
      await router.replaceUrl({ url: "pages/AuthPage" });
    } catch (err) {
      hilog.error(DOMAIN, TAG, "replaceUrl failed: %{public}s", JSON.stringify(err));
    }
  }

  /**
   * Clay OTP bubble — a rounded chat bubble filled with the brand color (asymmetric
   * bottom-left corner reads as the message tail), holding three light dots that stand
   * in for a verification code. Same brand-mark language as `views/MainShell` (a filled
   * brand `Circle`).
   */
  @Builder
  OtpBubble() {
    Row({ space: 10 }) {
      Circle({ width: 12, height: 12 }).fill($r("app.color.surface"));
      Circle({ width: 12, height: 12 }).fill($r("app.color.surface"));
      Circle({ width: 12, height: 12 }).fill($r("app.color.surface"));
    }
    .width(120)
    .height(88)
    .justifyContent(FlexAlign.Center)
    .backgroundColor($r("app.color.brand"))
    .borderRadius({ topLeft: 28, topRight: 28, bottomRight: 28, bottomLeft: 8 });
  }

  build() {
    Stack() {
      Column({ space: 20 }) {
        this.OtpBubble();
        Text(BRAND.toUpperCase())
          .fontSize(30)
          .fontWeight(FontWeight.Bold)
          .letterSpacing(3)
          .fontColor($r("app.color.text_primary"));
        Text(TAGLINE).fontSize(15).fontColor($r("app.color.text_secondary"));
      }
      .alignItems(HorizontalAlign.Center)
      .opacity(this.contentOpacity)
      .scale({ x: this.contentScale, y: this.contentScale });
    }
    .width("100%")
    .height("100%")
    .alignContent(Alignment.Center)
    .backgroundColor($r("app.color.page_background"));
  }
}
