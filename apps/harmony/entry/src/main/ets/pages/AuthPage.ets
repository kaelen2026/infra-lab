import { common } from "@kit.AbilityKit";
import { HarmonyAuthClient } from "../sdk/AuthClient";
import { HuksTokenStore } from "../sdk/HuksTokenStore";
import { describeAuthError } from "../sdk/messages";
import { API_BASE_URL, getDeviceInfo } from "../common/config";
import { AuthUser, DeviceInfo, OTP_LIMITS, RequestOtpResponse, VerifyOtpResponse } from "../common/contracts";

type Step = "phone" | "code" | "done";

/**
 * Phone-OTP login (login == register), the harmony face of the same flow `apps/web`
 * ships: phone → 6-digit code → done. All state and SDK calls live here; the API is
 * the sole authority for code issuance, limits and lockout — the UI only reflects them.
 */
@Entry
@Component
struct AuthPage {
  @State step: Step = "phone";
  @State phone: string = "+86";
  @State code: string = "";
  @State busy: boolean = false;
  @State errorText: string = "";
  @State cooldown: number = 0;
  @State user: AuthUser | null = null;

  private client: HarmonyAuthClient | null = null;
  private cooldownTimer: number = -1;

  aboutToDisappear(): void {
    this.stopCooldown();
  }

  private getClient(): HarmonyAuthClient {
    if (this.client === null) {
      const ctx: common.Context = getContext(this) as common.Context;
      this.client = new HarmonyAuthClient(API_BASE_URL, new HuksTokenStore(ctx));
    }
    return this.client;
  }

  private digits(value: string): string {
    return value.replace(/\D/g, "");
  }

  private startCooldown(seconds: number): void {
    this.stopCooldown();
    this.cooldown = seconds;
    this.cooldownTimer = setInterval(() => {
      this.cooldown -= 1;
      if (this.cooldown <= 0) {
        this.stopCooldown();
      }
    }, 1000);
  }

  private stopCooldown(): void {
    if (this.cooldownTimer >= 0) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = -1;
    }
  }

  private async sendCode(): Promise<void> {
    this.errorText = "";
    this.busy = true;
    try {
      const res: RequestOtpResponse = await this.getClient().requestOtp({
        phone: this.phone,
        platform: "harmony",
      });
      const wait: number = res.resendAfterSeconds > 0 ? res.resendAfterSeconds : OTP_LIMITS.resendCooldownSeconds;
      this.startCooldown(wait);
      this.step = "code";
    } catch (err) {
      this.errorText = describeAuthError(err as object);
    } finally {
      this.busy = false;
    }
  }

  private async verify(): Promise<void> {
    this.errorText = "";
    this.busy = true;
    try {
      const device: DeviceInfo = await getDeviceInfo(getContext(this) as common.Context);
      const res: VerifyOtpResponse = await this.getClient().verifyOtp({
        phone: this.phone,
        code: this.code,
        platform: "harmony",
        device: device,
      });
      this.user = res.user;
      this.step = "done";
      this.stopCooldown();
    } catch (err) {
      this.errorText = describeAuthError(err as object);
    } finally {
      this.busy = false;
    }
  }

  private async logout(): Promise<void> {
    this.busy = true;
    try {
      await this.getClient().logout();
    } catch (_err) {
      // Best-effort: clear local state regardless of server response.
    } finally {
      this.user = null;
      this.code = "";
      this.errorText = "";
      this.step = "phone";
      this.busy = false;
    }
  }

  private changePhone(): void {
    this.errorText = "";
    this.code = "";
    this.step = "phone";
  }

  private canSend(): boolean {
    return this.digits(this.phone).length >= 8;
  }

  private canVerify(): boolean {
    return this.code.length === OTP_LIMITS.codeLength;
  }

  /**
   * Whether the current step's primary action is allowed. Read via `this` inside the
   * PrimaryButton @Builder so ArkUI tracks the state deps and re-renders — a value-type
   * @Builder param would be frozen at first render and never re-enable.
   */
  private primaryEnabled(): boolean {
    if (this.step === "phone") {
      return this.canSend();
    }
    if (this.step === "code") {
      return this.canVerify();
    }
    return true;
  }

  @Builder
  Header(title: string, subtitle: string) {
    Column({ space: 8 }) {
      Text(title).fontSize(26).fontWeight(FontWeight.Bold).fontColor($r("app.color.text_primary"));
      Text(subtitle).fontSize(15).fontColor($r("app.color.text_secondary"));
    }
    .alignItems(HorizontalAlign.Start)
    .width("100%")
    .margin({ bottom: 28 });
  }

  @Builder
  ErrorLine() {
    if (this.errorText.length > 0) {
      Text(this.errorText)
        .fontSize(14)
        .fontColor($r("app.color.danger"))
        .width("100%")
        .margin({ top: 12 });
    }
  }

  @Builder
  PrimaryButton(label: string, action: () => void) {
    Button(this.busy ? "请稍候…" : label)
      .width("100%")
      .height(48)
      .fontSize(17)
      .backgroundColor($r("app.color.brand"))
      .opacity(this.primaryEnabled() && !this.busy ? 1 : 0.4)
      .enabled(this.primaryEnabled() && !this.busy)
      .onClick(action);
  }

  @Builder
  PhoneStep() {
    Column() {
      this.Header("手机号登录", "未注册的手机号验证后将自动创建账号");
      TextInput({ text: this.phone, placeholder: "+8613800138000" })
        .type(InputType.PhoneNumber)
        .height(48)
        .fontSize(17)
        .onChange((value: string) => {
          this.phone = value.trim();
        });
      this.PrimaryButton("获取验证码", () => {
        void this.sendCode();
      });
      this.ErrorLine();
    }
    .width("100%");
  }

  @Builder
  CodeStep() {
    Column() {
      this.Header("输入验证码", `验证码已发送至 ${this.phone}`);
      TextInput({ text: this.code, placeholder: "6 位验证码" })
        .type(InputType.Number)
        .maxLength(OTP_LIMITS.codeLength)
        .height(48)
        .fontSize(20)
        .onChange((value: string) => {
          this.code = this.digits(value).slice(0, OTP_LIMITS.codeLength);
        });
      this.PrimaryButton("登录 / 注册", () => {
        void this.verify();
      });

      Row({ space: 24 }) {
        Text(this.cooldown > 0 ? `${this.cooldown}s 后可重发` : "重新发送")
          .fontSize(14)
          .fontColor(this.cooldown > 0 ? $r("app.color.text_secondary") : $r("app.color.brand"))
          .onClick(() => {
            if (this.cooldown <= 0 && !this.busy) {
              void this.sendCode();
            }
          });
        Text("换个手机号")
          .fontSize(14)
          .fontColor($r("app.color.brand"))
          .onClick(() => {
            this.changePhone();
          });
      }
      .justifyContent(FlexAlign.Center)
      .width("100%")
      .margin({ top: 16 });

      this.ErrorLine();
    }
    .width("100%");
  }

  @Builder
  DoneStep() {
    Column({ space: 8 }) {
      this.Header(
        this.user?.isNew === true ? "欢迎加入 🎉" : "欢迎回来",
        `已登录：${this.user?.phone ?? ""}`,
      );
      Text(this.user?.isNew === true ? "账号已为你自动创建。" : "登录状态已就绪。")
        .fontSize(15)
        .fontColor($r("app.color.text_secondary"))
        .width("100%");
      this.PrimaryButton("退出登录", () => {
        void this.logout();
      });
    }
    .width("100%");
  }

  build() {
    Column() {
      if (this.step === "phone") {
        this.PhoneStep();
      } else if (this.step === "code") {
        this.CodeStep();
      } else {
        this.DoneStep();
      }
    }
    .width("100%")
    .height("100%")
    .padding({ left: 24, right: 24, top: 96 })
    .alignItems(HorizontalAlign.Start)
    .backgroundColor($r("app.color.page_background"));
  }
}
