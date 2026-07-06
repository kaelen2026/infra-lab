import { auth, HttpAuthError, withRefresh, wxTokenStore } from "../sdk";

interface ProfileData {
  phone: string;
  displayName: string;
  draft: string;
  busy: boolean;
  error: string;
}

interface ProfileCustom {
  onNameInput(e: WechatMiniprogram.Input): void;
  load(): Promise<void>;
  save(): Promise<void>;
  logout(): void;
  guard(err: unknown): boolean;
}

Page<ProfileData, ProfileCustom>({
  data: { phone: "", displayName: "", draft: "", busy: false, error: "" },

  onShow() {
    if (!wxTokenStore.load()) {
      wx.reLaunch({ url: "/pages/login/index" });
      return;
    }
    void this.load();
  },

  onNameInput(e) {
    this.setData({ draft: e.detail.value, error: "" });
  },

  async load() {
    try {
      const user = await withRefresh(auth, () => auth.me());
      const name = user.displayName ?? "";
      this.setData({ phone: user.phone, displayName: name, draft: name });
    } catch (err) {
      if (!this.guard(err)) this.setData({ error: "加载失败" });
    }
  },

  async save() {
    const displayName = this.data.draft.trim();
    if (this.data.busy || displayName === this.data.displayName) return;
    this.setData({ busy: true, error: "" });
    try {
      const user = await withRefresh(auth, () => auth.updateProfile({ displayName }));
      const name = user.displayName ?? "";
      this.setData({ displayName: name, draft: name });
      wx.showToast({ title: "已保存", icon: "success" });
    } catch (err) {
      if (!this.guard(err)) this.setData({ error: "保存失败" });
    } finally {
      this.setData({ busy: false });
    }
  },

  logout() {
    wxTokenStore.clear();
    wx.reLaunch({ url: "/pages/login/index" });
  },

  guard(err) {
    if (err instanceof HttpAuthError && err.status === 401) {
      wxTokenStore.clear();
      wx.reLaunch({ url: "/pages/login/index" });
      return true;
    }
    return false;
  },
});
