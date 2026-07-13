import { expect, type Page, test } from "@playwright/test";

/** Unique E.164 phone per run, to dodge the 10/day-per-phone OTP limit. */
function uniquePhone(): string {
  return `+8613${Date.now().toString().slice(-9)}`;
}

/** Request a code, read it from the debug-coded response, and fill it in. */
async function requestAndFillCode(page: Page, code?: string): Promise<string> {
  const responded = page.waitForResponse(
    (r) => r.url().includes("/auth/otp/request") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "获取验证码" }).click();
  const body = (await (await responded).json()) as { debugCode?: string };
  const real = body.debugCode ?? "";
  expect(real).toMatch(/^\d{6}$/);

  await expect(page.getByLabel("6 位验证码")).toBeVisible();
  await page.getByLabel("6 位验证码").fill(code ?? real);
  return real;
}

test.describe("phone OTP auth", () => {
  test("logs in, lands on the dashboard, then logs out", async ({ page }) => {
    const phone = uniquePhone();

    await page.goto("/auth");
    await expect(page.getByRole("heading", { name: "手机号登录" })).toBeVisible();

    await page.getByLabel("手机号").fill(phone);
    await requestAndFillCode(page);
    await page.getByRole("button", { name: "登录 / 注册" }).click();

    // Redirected to the protected dashboard with the account showing.
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "账户" })).toBeVisible();
    await expect(page.getByText(phone).first()).toBeVisible();
    // The login we just performed shows in the recent-login audit.
    await expect(page.getByText("最近登录")).toBeVisible();
    await expect(page.getByText("成功").first()).toBeVisible();

    // Log out via the nav user menu.
    await page.getByRole("button", { name: "账户菜单" }).click();
    await page.getByRole("menuitem", { name: "退出登录" }).click();

    await expect(page).toHaveURL("/auth");
    await expect(page.getByRole("heading", { name: "手机号登录" })).toBeVisible();
  });

  test("rejects a wrong code with an inline error", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("手机号").fill(uniquePhone());
    await requestAndFillCode(page, "000000");
    await page.getByRole("button", { name: "登录 / 注册" }).click();

    await expect(page.getByRole("alert")).toContainText("验证码错误");
    await expect(page).toHaveURL("/auth");
  });

  test("shows the public landing page to unauthenticated visitors", async ({ page }) => {
    await page.goto("/");
    // `/` is now a public marketing landing, not a redirect to /auth.
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "一个手机号，登录你的每一台设备" }),
    ).toBeVisible();

    // Its primary CTA leads to the auth screen.
    await page.getByRole("link", { name: "立即登录 / 注册" }).first().click();
    await expect(page).toHaveURL("/auth");
    await expect(page.getByLabel("手机号")).toBeVisible();
  });
});
