import { common } from "@kit.AbilityKit";
import { HarmonyAuthClient } from "../sdk/AuthClient";
import { HarmonyTodoClient } from "../sdk/TodoClient";
import { HuksTokenStore } from "../sdk/HuksTokenStore";
import { formatDate, formatDateTime, platformLabel } from "../sdk/format";
import { API_BASE_URL } from "../common/config";
import { DeviceDTO, LoginEventDTO } from "../common/contracts";
import { TITLE_MAX_LENGTH, TodoDTO } from "../common/todo";
import { applyTheme, getInitialTheme, persistTheme, ThemeMode } from "../common/theme";

/**
 * The signed-in shell (mirrors `apps/h5`): a brand header + a bottom tab bar over
 * two tabs — Account (profile / session / devices / login history) and Todos
 * (per-user list with add / toggle / delete). It builds its own `@ohos.net.http`
 * clients from the shared HUKS token store, so both tabs ride the session that
 * login established. `onLogout` hands control back to the auth page.
 */
@Component
export struct MainShell {
  // Flattened user fields supplied by the auth page (no nullable object prop).
  @Prop userPhone: string = "";
  @Prop userDisplayName: string = "";
  @Prop userAvatarUrl: string = "";
  @Prop userCreatedAt: string = "";
  @Prop userIsNew: boolean = false;
  onLogout: () => void = () => {};

  @State private currentIndex: number = 0;
  /** Current theme, mirrored into a glyph in the top bar; the source of truth is the app color mode. */
  @State private theme: ThemeMode = "dark";

  // Account tab state.
  @State private devices: DeviceDTO[] = [];
  @State private events: LoginEventDTO[] = [];
  @State private accountLoaded: boolean = false;
  @State private accountError: string = "";

  // Todos tab state.
  @State private todos: TodoDTO[] = [];
  @State private todosLoaded: boolean = false;
  @State private todosError: string = "";
  @State private newTitle: string = "";
  @State private creating: boolean = false;
  /** Id of the todo whose toggle/delete is in flight ("" when idle). */
  @State private pendingId: string = "";

  private authClient: HarmonyAuthClient | null = null;
  private todoClient: HarmonyTodoClient | null = null;

  aboutToAppear(): void {
    void this.initTheme();
    void this.loadAccount();
    void this.loadTodos();
  }

  private async initTheme(): Promise<void> {
    const ctx: common.Context = getContext(this) as common.Context;
    this.theme = await getInitialTheme(ctx);
  }

  private async toggleTheme(): Promise<void> {
    const ctx: common.Context = getContext(this) as common.Context;
    const next: ThemeMode = this.theme === "dark" ? "light" : "dark";
    this.theme = next;
    applyTheme(ctx, next);
    await persistTheme(ctx, next);
  }

  private auth(): HarmonyAuthClient {
    if (this.authClient === null) {
      const ctx: common.Context = getContext(this) as common.Context;
      this.authClient = new HarmonyAuthClient(API_BASE_URL, new HuksTokenStore(ctx));
    }
    return this.authClient;
  }

  private todoApi(): HarmonyTodoClient {
    if (this.todoClient === null) {
      const ctx: common.Context = getContext(this) as common.Context;
      this.todoClient = new HarmonyTodoClient(API_BASE_URL, new HuksTokenStore(ctx));
    }
    return this.todoClient;
  }

  // ── Data ────────────────────────────────────────────────────────────────────
  private async loadAccount(): Promise<void> {
    try {
      this.devices = await this.auth().listDevices();
      this.events = await this.auth().listLoginEvents();
    } catch (_err) {
      this.accountError = "无法加载账户数据，请稍后重试。";
    } finally {
      this.accountLoaded = true;
    }
  }

  private async loadTodos(): Promise<void> {
    try {
      this.todos = await this.todoApi().list();
    } catch (_err) {
      this.todosError = "无法加载待办，请稍后重试。";
    } finally {
      this.todosLoaded = true;
    }
  }

  private async createTodo(): Promise<void> {
    const title: string = this.newTitle.trim();
    if (title.length === 0 || this.creating) {
      return;
    }
    this.creating = true;
    this.todosError = "";
    try {
      const created: TodoDTO = await this.todoApi().create({ title: title });
      this.todos = [created, ...this.todos];
      this.newTitle = "";
    } catch (_err) {
      this.todosError = "创建失败，请重试。";
    } finally {
      this.creating = false;
    }
  }

  private async toggleTodo(todo: TodoDTO): Promise<void> {
    if (this.pendingId.length > 0) {
      return;
    }
    this.pendingId = todo.id;
    this.todosError = "";
    try {
      const updated: TodoDTO = await this.todoApi().toggle(todo.id, !todo.completed);
      this.todos = this.todos.map((t: TodoDTO): TodoDTO => (t.id === updated.id ? updated : t));
    } catch (_err) {
      this.todosError = "更新失败，请重试。";
    } finally {
      this.pendingId = "";
    }
  }

  private async removeTodo(id: string): Promise<void> {
    if (this.pendingId.length > 0) {
      return;
    }
    this.pendingId = id;
    this.todosError = "";
    try {
      await this.todoApi().remove(id);
      this.todos = this.todos.filter((t: TodoDTO): boolean => t.id !== id);
    } catch (_err) {
      this.todosError = "删除失败，请重试。";
    } finally {
      this.pendingId = "";
    }
  }

  private async logout(): Promise<void> {
    try {
      await this.auth().logout();
    } catch (_err) {
      // Best-effort: clear local state regardless of the server response.
    } finally {
      this.onLogout();
    }
  }

  // ── Small helpers (read once into a local to keep ArkTS narrowing happy) ──────
  private displayName(): string {
    const name: string = this.userDisplayName.trim();
    return name.length > 0 ? name : "未命名用户";
  }

  private monogram(): string {
    const name: string = this.userDisplayName.trim();
    if (name.length > 0) {
      return name.substring(0, 1).toUpperCase();
    }
    const digits: string = this.userPhone.replace(/\D/g, "");
    if (digits.length >= 2) {
      return digits.substring(digits.length - 2);
    }
    return digits.length > 0 ? digits : "··";
  }

  private canAdd(): boolean {
    return !this.creating && this.newTitle.trim().length > 0;
  }

  // ── Reusable pieces ───────────────────────────────────────────────────────────
  @Builder
  Tag(text: string) {
    Text(text)
      .fontSize(12)
      .fontColor($r("app.color.text_secondary"))
      .padding({ left: 8, right: 8, top: 2, bottom: 2 })
      .border({ width: 1, color: $r("app.color.border") })
      .borderRadius(6);
  }

  @Builder
  StatusTag(success: boolean) {
    Text(success ? "成功" : "失败")
      .fontSize(12)
      .fontColor(success ? $r("app.color.brand") : $r("app.color.danger"))
      .padding({ left: 8, right: 8, top: 2, bottom: 2 })
      .border({ width: 1, color: success ? $r("app.color.brand") : $r("app.color.danger") })
      .borderRadius(6);
  }

  @Builder
  KV(label: string, value: string) {
    Row() {
      Text(label).fontSize(14).fontColor($r("app.color.text_secondary"));
      Text(value).fontSize(14).fontColor($r("app.color.text_primary"));
    }
    .width("100%")
    .height(36)
    .justifyContent(FlexAlign.SpaceBetween);
  }

  @Builder
  SectionHeader(title: string, subtitle: string) {
    Column({ space: 4 }) {
      Text(title).fontSize(22).fontWeight(FontWeight.Medium).fontColor($r("app.color.text_primary"));
      Text(subtitle).fontSize(14).fontColor($r("app.color.text_secondary"));
    }
    .width("100%")
    .alignItems(HorizontalAlign.Start);
  }

  @Builder
  TopBar() {
    Row() {
      Row({ space: 8 }) {
        Circle({ width: 8, height: 8 }).fill($r("app.color.brand"));
        Text("infra-lab").fontSize(18).fontWeight(FontWeight.Medium).fontColor($r("app.color.text_primary"));
      }
      Row({ space: 20 }) {
        // Sun when dark (tap → light), moon when light — matching web/h5's toggle glyph.
        Text(this.theme === "dark" ? "☀" : "☾")
          .fontSize(18)
          .fontColor($r("app.color.text_secondary"))
          .onClick(() => {
            void this.toggleTheme();
          });
        Text("退出")
          .fontSize(15)
          .fontColor($r("app.color.brand"))
          .onClick(() => {
            void this.logout();
          });
      }
      .alignItems(VerticalAlign.Center);
    }
    .width("100%")
    .height(52)
    .padding({ left: 20, right: 20 })
    .justifyContent(FlexAlign.SpaceBetween)
    .alignItems(VerticalAlign.Center)
    .backgroundColor($r("app.color.surface"))
    .border({ width: { bottom: 1 }, color: $r("app.color.border") });
  }

  @Builder
  BottomTab(label: string, index: number) {
    Column() {
      Text(label)
        .fontSize(13)
        .fontWeight(this.currentIndex === index ? FontWeight.Medium : FontWeight.Normal)
        .fontColor(this.currentIndex === index ? $r("app.color.brand") : $r("app.color.text_secondary"));
    }
    .width("100%")
    .height(52)
    .justifyContent(FlexAlign.Center);
  }

  // ── Account tab ─────────────────────────────────────────────────────────────
  @Builder
  ProfileCard() {
    Row({ space: 16 }) {
      Stack() {
        if (this.userAvatarUrl.length > 0) {
          Image(this.userAvatarUrl).width(56).height(56).borderRadius(28);
        } else {
          Text(this.monogram()).fontSize(20).fontColor($r("app.color.surface"));
        }
      }
      .width(56)
      .height(56)
      .borderRadius(28)
      .backgroundColor($r("app.color.brand"))
      .alignContent(Alignment.Center);

      Column({ space: 4 }) {
        Text(this.displayName())
          .fontSize(18)
          .fontWeight(FontWeight.Medium)
          .fontColor($r("app.color.text_primary"))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis });
        Text(this.userPhone).fontSize(14).fontColor($r("app.color.text_secondary"));
        Text(`注册于 ${formatDate(this.userCreatedAt)}`).fontSize(12).fontColor($r("app.color.text_secondary"));
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1);
    }
    .width("100%")
    .padding(16)
    .alignItems(VerticalAlign.Center)
    .backgroundColor($r("app.color.surface"))
    .borderRadius(12)
    .border({ width: 1, color: $r("app.color.border") });
  }

  @Builder
  SessionCard() {
    Column() {
      Text("当前会话")
        .fontSize(16)
        .fontWeight(FontWeight.Medium)
        .fontColor($r("app.color.text_primary"))
        .width("100%")
        .margin({ bottom: 4 });
      this.KV("平台", "HarmonyOS");
      this.KV("凭证", "Bearer · HUKS 加密存储");
      this.KV("状态", this.userIsNew ? "已注册" : "活跃");
    }
    .width("100%")
    .padding(16)
    .alignItems(HorizontalAlign.Start)
    .backgroundColor($r("app.color.surface"))
    .borderRadius(12)
    .border({ width: 1, color: $r("app.color.border") });
  }

  @Builder
  DevicesCard() {
    Column({ space: 12 }) {
      Text("设备").fontSize(16).fontWeight(FontWeight.Medium).fontColor($r("app.color.text_primary")).width("100%");
      if (!this.accountLoaded) {
        Text("加载中…").fontSize(14).fontColor($r("app.color.text_secondary")).width("100%");
      } else if (this.devices.length > 0) {
        ForEach(
          this.devices,
          (d: DeviceDTO) => {
            Row() {
              Column({ space: 2 }) {
                Text(d.model !== null && d.model.length > 0 ? d.model : "未知机型")
                  .fontSize(14)
                  .fontColor($r("app.color.text_primary"));
                Text(`最近 ${formatDate(d.lastSeenAt)}`).fontSize(12).fontColor($r("app.color.text_secondary"));
              }
              .alignItems(HorizontalAlign.Start)
              .layoutWeight(1);
              this.Tag(platformLabel(d.platform));
            }
            .width("100%")
            .justifyContent(FlexAlign.SpaceBetween)
            .alignItems(VerticalAlign.Center);
          },
          (d: DeviceDTO) => d.id,
        );
      } else {
        Text("还没有原生设备登录。").fontSize(14).fontColor($r("app.color.text_secondary")).width("100%");
      }
    }
    .width("100%")
    .padding(16)
    .alignItems(HorizontalAlign.Start)
    .backgroundColor($r("app.color.surface"))
    .borderRadius(12)
    .border({ width: 1, color: $r("app.color.border") });
  }

  @Builder
  LoginEventsCard() {
    Column({ space: 12 }) {
      Text("最近登录").fontSize(16).fontWeight(FontWeight.Medium).fontColor($r("app.color.text_primary")).width("100%");
      if (!this.accountLoaded) {
        Text("加载中…").fontSize(14).fontColor($r("app.color.text_secondary")).width("100%");
      } else if (this.events.length > 0) {
        ForEach(
          this.events,
          (e: LoginEventDTO) => {
            Row({ space: 8 }) {
              Text(formatDateTime(e.createdAt)).fontSize(12).fontColor($r("app.color.text_secondary")).layoutWeight(1);
              this.Tag(platformLabel(e.platform));
              this.StatusTag(e.success);
            }
            .width("100%")
            .alignItems(VerticalAlign.Center);
          },
          (e: LoginEventDTO) => e.id,
        );
      } else {
        Text("还没有登录记录。").fontSize(14).fontColor($r("app.color.text_secondary")).width("100%");
      }
    }
    .width("100%")
    .padding(16)
    .alignItems(HorizontalAlign.Start)
    .backgroundColor($r("app.color.surface"))
    .borderRadius(12)
    .border({ width: 1, color: $r("app.color.border") });
  }

  @Builder
  AccountContent() {
    Scroll() {
      Column({ space: 16 }) {
        this.SectionHeader("账户", "你的资料、当前会话与登录记录。");
        this.ProfileCard();
        this.SessionCard();
        this.DevicesCard();
        this.LoginEventsCard();
        if (this.accountError.length > 0) {
          Text(this.accountError).fontSize(14).fontColor($r("app.color.danger")).width("100%");
        }
      }
      .width("100%")
      .padding(20)
      .alignItems(HorizontalAlign.Start);
    }
    .width("100%")
    .height("100%")
    .align(Alignment.Top);
  }

  // ── Todos tab ─────────────────────────────────────────────────────────────────
  @Builder
  TodoRow(t: TodoDTO) {
    Row({ space: 12 }) {
      Stack() {
        if (t.completed) {
          Text("✓").fontSize(14).fontColor($r("app.color.surface"));
        }
      }
      .width(24)
      .height(24)
      .borderRadius(12)
      .backgroundColor(t.completed ? $r("app.color.brand") : $r("app.color.surface"))
      .border({ width: 1, color: t.completed ? $r("app.color.brand") : $r("app.color.border") })
      .alignContent(Alignment.Center)
      .onClick(() => {
        void this.toggleTodo(t);
      });

      Text(t.title)
        .fontSize(15)
        .layoutWeight(1)
        .fontColor(t.completed ? $r("app.color.text_secondary") : $r("app.color.text_primary"))
        .decoration({ type: t.completed ? TextDecorationType.LineThrough : TextDecorationType.None })
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis });

      Text("删除")
        .fontSize(13)
        .fontColor($r("app.color.text_secondary"))
        .onClick(() => {
          void this.removeTodo(t.id);
        });
    }
    .width("100%")
    .padding({ top: 12, bottom: 12 })
    .alignItems(VerticalAlign.Center)
    .border({ width: { bottom: 1 }, color: $r("app.color.border") });
  }

  @Builder
  TodosContent() {
    Scroll() {
      Column({ space: 16 }) {
        this.SectionHeader("待办", "按用户隔离的待办清单。");

        Row({ space: 8 }) {
          TextInput({ text: this.newTitle, placeholder: "添加一项待办…" })
            .layoutWeight(1)
            .height(44)
            .fontSize(15)
            .enabled(!this.creating)
            .onChange((value: string) => {
              this.newTitle = value.substring(0, TITLE_MAX_LENGTH);
            })
            .onSubmit(() => {
              void this.createTodo();
            });
          Button(this.creating ? "…" : "添加")
            .height(44)
            .fontSize(15)
            .backgroundColor($r("app.color.brand"))
            .enabled(this.canAdd())
            .opacity(this.canAdd() ? 1 : 0.4)
            .onClick(() => {
              void this.createTodo();
            });
        }
        .width("100%");

        if (!this.todosLoaded) {
          Text("加载中…").fontSize(14).fontColor($r("app.color.text_secondary")).width("100%");
        } else if (this.todos.length > 0) {
          Column() {
            ForEach(
              this.todos,
              (t: TodoDTO) => {
                this.TodoRow(t);
              },
              (t: TodoDTO) => `${t.id}-${t.completed ? "1" : "0"}-${t.title}`,
            );
          }
          .width("100%");
        } else {
          Text("还没有待办，添加一项开始吧。").fontSize(14).fontColor($r("app.color.text_secondary")).width("100%");
        }

        if (this.todosError.length > 0) {
          Text(this.todosError).fontSize(14).fontColor($r("app.color.danger")).width("100%");
        }
      }
      .width("100%")
      .padding(20)
      .alignItems(HorizontalAlign.Start);
    }
    .width("100%")
    .height("100%")
    .align(Alignment.Top);
  }

  build() {
    Column() {
      this.TopBar();
      Tabs({ barPosition: BarPosition.End }) {
        TabContent() {
          this.AccountContent();
        }
        .tabBar(this.BottomTab("账户", 0));
        TabContent() {
          this.TodosContent();
        }
        .tabBar(this.BottomTab("待办", 1));
      }
      .layoutWeight(1)
      .scrollable(false)
      .barBackgroundColor($r("app.color.surface"))
      .onChange((index: number) => {
        this.currentIndex = index;
      });
    }
    .width("100%")
    .height("100%")
    .backgroundColor($r("app.color.page_background"));
  }
}
