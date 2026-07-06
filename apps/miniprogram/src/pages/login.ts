import { auth, deviceInfo, HttpAuthError, wxTokenStore } from "../sdk";

interface LoginData {
  step: "phone" | "code";
  phone: string;
  code: string;
  busy: boolean;
  cooldown: number;
  error: string;
}

interface LoginCustom {
  cooldownTimer: number | null;
  onPhoneInput(e: WechatMiniprogram.Input): void;
  onCodeInput(e: WechatMiniprogram.Input): void;
  requestCode(): Promise<void>;
  verify(): Promise<void>;
  startCooldown(seconds: number): void;
  clearCooldown(): void;
  fail(err: unknown): void;
}

Page<LoginData, LoginCustom>({
  data: {
    step: "phone",
    phone: "",
    code: "",
    busy: false,
    cooldown: 0,
    error: "",
  },

  cooldownTimer: null,

  onShow() {
    // Already signed in → skip straight to the app.
    if (wxTokenStore.load()) {
      wx.reLaunch({ url: "/pages/todo/index" });
    }
  },

  onUnload() {
    this.clearCooldown();
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value.trim(), error: "" });
  },

  onCodeInput(e) {
    this.setData({ code: e.detail.value.trim(), error: "" });
  },

  async requestCode() {
    if (this.data.busy || this.data.cooldown > 0) return;
    if (this.data.phone.length < 6) {
      this.setData({ error: "请输入手机号" });
      return;
    }
    this.setData({ busy: true, error: "" });
    try {
      const res = await auth.requestOtp({ phone: this.data.phone, platform: "weapp" });
      // debugCode is present only when OTP_DEBUG_RETURN_CODE is on (dev) — prefill it.
      this.setData({ step: "code", code: res.debugCode ?? "" });
      this.startCooldown(res.resendAfterSeconds);
    } catch (err) {
      this.fail(err);
    } finally {
      this.setData({ busy: false });
    }
  },

  async verify() {
    if (this.data.busy) return;
    if (this.data.code.length < 4) {
      this.setData({ error: "请输入验证码" });
      return;
    }
    this.setData({ busy: true, error: "" });
    try {
      // The SDK persists the returned tokens into wxTokenStore on success.
      await auth.verifyOtp({
        phone: this.data.phone,
        code: this.data.code,
        platform: "weapp",
        device: deviceInfo(),
      });
      this.clearCooldown();
      wx.reLaunch({ url: "/pages/todo/index" });
    } catch (err) {
      this.fail(err);
    } finally {
      this.setData({ busy: false });
    }
  },

  startCooldown(seconds) {
    this.clearCooldown();
    this.setData({ cooldown: seconds });
    this.cooldownTimer = setInterval(() => {
      const next = this.data.cooldown - 1;
      if (next <= 0) {
        this.clearCooldown();
        this.setData({ cooldown: 0 });
      } else {
        this.setData({ cooldown: next });
      }
    }, 1000) as unknown as number;
  },

  clearCooldown() {
    if (this.cooldownTimer !== null) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  },

  fail(err) {
    const message =
      err instanceof HttpAuthError
        ? err.retryAfter
          ? `请稍后 ${err.retryAfter}s 再试`
          : err.code
        : "网络异常，请重试";
    this.setData({ error: message });
  },
});
