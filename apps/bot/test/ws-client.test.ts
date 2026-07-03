import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 捕获 WSClient 构造参数;start 是 no-op,测试里绝不真连飞书。
// 注意要用普通函数(可 new),箭头函数不是 constructor。
const wsClientCtor = vi.fn(function WSClient(_config: unknown) {
  return { start: vi.fn() };
});

vi.mock("@larksuiteoapi/node-sdk", () => ({
  WSClient: wsClientCtor,
  Domain: { Feishu: "feishu", Lark: "lark" },
  LoggerLevel: { info: 2 },
  EventDispatcher: class {
    register(): this {
      return this;
    }
  },
}));

describe("startFeishuWsClient — 长连接存活配置", () => {
  beforeEach(() => {
    vi.resetModules();
    wsClientCtor.mockClear();
    process.env.LARK_APP_ID = "cli_test";
    process.env.LARK_APP_SECRET = "secret_test";
  });

  afterEach(() => {
    delete process.env.LARK_APP_ID;
    delete process.env.LARK_APP_SECRET;
  });

  // 回归守卫（2026-07-03 事故）:不传 wsConfig.pingTimeout 时 SDK 的 pong
  // watchdog 是 no-op,半开 TCP（静默断开,无 close/error 事件）永远不会被
  // 检测,bot 会守着死连接直到人工重启。此测试在未修复代码上失败。
  it("必须开启 pong watchdog(wsConfig.pingTimeout),否则半开连接检测不到", async () => {
    const { startFeishuWsClient } = await import("../src/feishu/ws-client.js");
    startFeishuWsClient();

    expect(wsClientCtor).toHaveBeenCalledTimes(1);
    const config = wsClientCtor.mock.calls[0]?.[0] as
      | { wsConfig?: { pingTimeout?: number } }
      | undefined;
    expect(config).toBeDefined();
    const pingTimeout = config?.wsConfig?.pingTimeout;
    expect(pingTimeout).toBeGreaterThan(0);
    // SDK 固定每 120s ping 一次;watchdog 必须短于 ping 间隔,否则下一轮 ping
    // 会先清掉计时器,watchdog 永远不触发。
    expect(pingTimeout).toBeLessThan(120);
  });

  it("缺 LARK_APP_ID/SECRET 时跳过启动(不构造 WSClient)", async () => {
    delete process.env.LARK_APP_ID;
    delete process.env.LARK_APP_SECRET;
    const { startFeishuWsClient } = await import("../src/feishu/ws-client.js");
    startFeishuWsClient();
    expect(wsClientCtor).not.toHaveBeenCalled();
  });
});
