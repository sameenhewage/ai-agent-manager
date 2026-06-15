import { test, expect } from "@playwright/test";

test.describe("App shell (Slice 1)", () => {
  test("renders PEPPER ST. brand and exactly the three approved nav items", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByText("PEPPER ST.").first()).toBeVisible();

    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Chat Monitor" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Analytics" })).toBeVisible();
    await expect(nav.getByRole("link")).toHaveCount(3);
  });

  test("has no Bloomwire branding or parked surfaces", async ({ page }) => {
    await page.goto("/");
    const body = page.locator("body");
    await expect(body).not.toContainText("Bloomwire");
    await expect(body).not.toContainText("Order Conversations");
    await expect(body).not.toContainText("Staff Tasks");
  });

  test("navigates between the three surfaces", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Chat Monitor" }).click();
    await expect(page).toHaveURL(/\/chat-monitor$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Chat Monitor" })
    ).toBeVisible();

    await page.getByRole("link", { name: "Analytics" }).click();
    await expect(page).toHaveURL(/\/analytics$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Analytics" })
    ).toBeVisible();
  });

  test("dashboard shows honest placeholders, not fabricated metrics", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText("Awaiting data").first()).toBeVisible();
    await expect(page.getByText("This is the app shell.")).toBeVisible();
  });
});
