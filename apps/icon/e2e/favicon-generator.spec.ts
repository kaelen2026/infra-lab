import { expect, type Page, test } from "@playwright/test";

async function openFreshStudio(page: Page) {
  await page.goto("/favicon-generator");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test("edits the design and downloads the favicon pack", async ({ page }) => {
  await openFreshStudio(page);

  const appName = page.getByRole("textbox", { name: "app_name" });
  await expect(appName).toHaveValue("my-app");
  await appName.fill("client-app");

  await page.getByRole("button", { name: "random" }).click();

  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  await expect
    .poll(async () =>
      canvas.evaluate((node) => {
        const context = (node as HTMLCanvasElement).getContext("2d");
        if (!context) return false;
        const pixel = context.getImageData(512, 512, 1, 1).data;
        return (pixel[3] ?? 0) > 0;
      }),
    )
    .toBe(true);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "download .zip" }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("client-app-icons.zip");
});

test("keeps the studio usable on mobile viewports", async ({ page }) => {
  await openFreshStudio(page);

  await expect(page.getByRole("textbox", { name: "app_name" })).toBeVisible();
  await expect(page.getByRole("button", { name: "> icon" })).toBeVisible();
  await expect(page.getByRole("button", { name: "download .zip" }).first()).toBeVisible();

  const fitsViewport = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  expect(fitsViewport).toBe(true);
});
