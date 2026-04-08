import { test, expect } from "@playwright/test";

test.describe("Public pages", () => {
  test("homepage loads with title and CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/AppToText/);
    await expect(page.locator("text=Transform")).toBeVisible();
  });

  test("login page renders with email and OAuth options", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.locator("text=Welcome back")).toBeVisible();
    await expect(page.locator("text=GitHub")).toBeVisible();
    await expect(page.locator("text=Google")).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("signup page renders with form", async ({ page }) => {
    await page.goto("/auth/signup");
    await expect(page.locator("text=Create your account")).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("pricing page shows all 4 tiers", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator("text=Choose your AppToText plan")).toBeVisible();
    await expect(page.locator("text=Free")).toBeVisible();
    await expect(page.locator("text=Standard")).toBeVisible();
    await expect(page.locator("text=Pro")).toBeVisible();
    await expect(page.locator("text=Master")).toBeVisible();
  });

  test("about page loads", async ({ page }) => {
    await page.goto("/about");
    await expect(page).toHaveTitle(/AppToText/);
  });

  test("coming soon page shows roadmap", async ({ page }) => {
    await page.goto("/coming-soon");
    await expect(page.locator("text=Up Next")).toBeVisible();
  });

  test("login page forgot password link works", async ({ page }) => {
    await page.goto("/auth/login");
    await page.click("text=Forgot password?");
    await expect(page).toHaveURL(/forgot-password/);
  });

  test("login page sign up link works", async ({ page }) => {
    await page.goto("/auth/login");
    await page.click("text=Sign up");
    await expect(page).toHaveURL(/signup/);
  });

  test("unauthenticated dashboard redirect to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });
});
