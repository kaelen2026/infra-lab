/**
 * A `fetch`-shaped adapter over `wx.request`, so the mini-program can reuse
 * `@infra/sdk`'s `createAuthClient` verbatim (it only touches `res.ok` / `res.status`
 * / `res.json()`). The SDK already JSON-stringifies the body and sets `content-type`,
 * so we forward `init.body` straight into `data`. `credentials` is irrelevant here —
 * the Bearer header carries the session, cookies are never used.
 */
export const wxFetch: typeof fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  const method = (init?.method ?? "GET").toUpperCase() as WechatMiniprogram.RequestOption["method"];
  const header = (init?.headers ?? {}) as Record<string, string>;
  const data = (init?.body ?? undefined) as string | undefined;

  return new Promise<Response>((resolve, reject) => {
    wx.request({
      url,
      method,
      header,
      data,
      success: (res) => {
        const status = res.statusCode;
        // Minimal Response surface — only what the SDK reads.
        resolve({
          ok: status >= 200 && status < 300,
          status,
          json: () => Promise.resolve(res.data),
        } as unknown as Response);
      },
      fail: (err) => reject(new Error(err.errMsg)),
    });
  });
}) as typeof fetch;
