import { expect, test } from "@playwright/test";

test("la home carga en el celular", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Mira Turnos" })).toBeVisible();
  await expect(page.getByText("Hecho por Mira Studio")).toBeVisible();
});
