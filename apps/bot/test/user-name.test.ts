import type * as Lark from "@larksuiteoapi/node-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetUserNameCacheForTest, resolveSenderName } from "../src/feishu/user-name";

/** 造一个假的 Lark client，只实现 contact.v3.user.get。 */
function makeClient(get: (...args: unknown[]) => unknown): Lark.Client {
  return { contact: { v3: { user: { get } } } } as unknown as Lark.Client;
}

afterEach(() => {
  __resetUserNameCacheForTest();
});

describe("resolveSenderName", () => {
  it("成功解析出姓名", async () => {
    const client = makeClient(async () => ({ data: { user: { name: "张三" } } }));
    expect(await resolveSenderName("ou_1", { client })).toBe("张三");
  });

  it("无 client 时返回 undefined，不抛", async () => {
    expect(await resolveSenderName("ou_1", { client: null })).toBeUndefined();
  });

  it("空 open_id 直接返回 undefined，不调 API", async () => {
    const get = vi.fn();
    expect(await resolveSenderName("", { client: makeClient(get) })).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it("API 抛错时降级返回 undefined，不冒泡", async () => {
    const client = makeClient(async () => {
      throw new Error("no permission");
    });
    expect(await resolveSenderName("ou_1", { client })).toBeUndefined();
  });

  it("响应缺 name 时返回 undefined", async () => {
    const client = makeClient(async () => ({ data: { user: {} } }));
    expect(await resolveSenderName("ou_1", { client })).toBeUndefined();
  });

  it("命中缓存后不再调 API", async () => {
    const get = vi.fn(async () => ({ data: { user: { name: "李四" } } }));
    const client = makeClient(get);
    expect(await resolveSenderName("ou_2", { client })).toBe("李四");
    expect(await resolveSenderName("ou_2", { client })).toBe("李四");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("失败不写缓存，下次重试", async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ data: { user: { name: "王五" } } });
    const client = makeClient(get);
    expect(await resolveSenderName("ou_3", { client })).toBeUndefined();
    expect(await resolveSenderName("ou_3", { client })).toBe("王五");
    expect(get).toHaveBeenCalledTimes(2);
  });
});
