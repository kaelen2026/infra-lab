import type { TodoDTO } from "@infra/shared";
import { auth, HttpAuthError, todo, withRefresh, wxTokenStore } from "../sdk";

interface TodoData {
  todos: TodoDTO[];
  newTitle: string;
  busy: boolean;
  error: string;
}

interface TodoCustom {
  onTitleInput(e: WechatMiniprogram.Input): void;
  load(): Promise<void>;
  add(): Promise<void>;
  toggle(e: WechatMiniprogram.TouchEvent): Promise<void>;
  remove(e: WechatMiniprogram.TouchEvent): Promise<void>;
  goProfile(): void;
  guard(err: unknown): boolean;
}

Page<TodoData, TodoCustom>({
  data: { todos: [], newTitle: "", busy: false, error: "" },

  onShow() {
    if (!wxTokenStore.load()) {
      wx.reLaunch({ url: "/pages/login/index" });
      return;
    }
    void this.load();
  },

  onTitleInput(e) {
    this.setData({ newTitle: e.detail.value, error: "" });
  },

  async load() {
    try {
      const todos = await withRefresh(auth, () => todo.list());
      this.setData({ todos });
    } catch (err) {
      if (!this.guard(err)) this.setData({ error: "加载失败" });
    }
  },

  async add() {
    const title = this.data.newTitle.trim();
    if (this.data.busy || title.length === 0) return;
    this.setData({ busy: true, error: "" });
    try {
      const created = await withRefresh(auth, () => todo.create({ title }));
      this.setData({ todos: [created, ...this.data.todos], newTitle: "" });
    } catch (err) {
      if (!this.guard(err)) this.setData({ error: "添加失败" });
    } finally {
      this.setData({ busy: false });
    }
  },

  async toggle(e) {
    const id = e.currentTarget.dataset.id as string;
    const current = this.data.todos.find((t) => t.id === id);
    if (!current) return;
    try {
      const updated = await withRefresh(auth, () => todo.toggle(id, !current.completed));
      this.setData({ todos: this.data.todos.map((t) => (t.id === id ? updated : t)) });
    } catch (err) {
      if (!this.guard(err)) this.setData({ error: "更新失败" });
    }
  },

  async remove(e) {
    const id = e.currentTarget.dataset.id as string;
    try {
      await withRefresh(auth, () => todo.remove(id));
      this.setData({ todos: this.data.todos.filter((t) => t.id !== id) });
    } catch (err) {
      if (!this.guard(err)) this.setData({ error: "删除失败" });
    }
  },

  goProfile() {
    wx.navigateTo({ url: "/pages/profile/index" });
  },

  // A 401 that survives one refresh means the session is gone → back to login.
  guard(err) {
    if (err instanceof HttpAuthError && err.status === 401) {
      wxTokenStore.clear();
      wx.reLaunch({ url: "/pages/login/index" });
      return true;
    }
    return false;
  },
});
