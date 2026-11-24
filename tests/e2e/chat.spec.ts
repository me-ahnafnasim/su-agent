import { expect, test, type Page } from "@playwright/test";

// UI tests mock /api/chat so they run without Gemini/Qdrant/PostgreSQL keys.
// Live agent behaviour (RAG, memory, restart) is verified manually — see README.

async function mockChat(page: Page, handler: (body: { message: string; sessionId: string }) => { status: number; json: unknown }) {
  const calls: Array<{ message: string; sessionId: string }> = [];
  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    const { status, json } = handler(body);
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(json) });
  });
  return calls;
}

const input = (page: Page) => page.getByRole("textbox", { name: "বার্তা" });
const send = (page: Page) => page.getByRole("button", { name: "বার্তা পাঠান" });

test("chat round-trip with Enter, same-origin request and stable sessionId", async ({ page }) => {
  const calls = await mockChat(page, () => ({ status: 200, json: { reply: "হ্যালো! আমি নোভা।" } }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SU Agent" })).toBeVisible();

  await expect(send(page)).toBeDisabled(); // empty input cannot be sent
  await input(page).fill("Hello, who are you?");
  await input(page).press("Enter");

  await expect(page.getByText("হ্যালো! আমি নোভা।")).toBeVisible();
  await expect(input(page)).toHaveValue("");
  expect(calls).toHaveLength(1);
  expect(calls[0].message).toBe("Hello, who are you?");

  // Reload keeps the same sessionId (agent memory continues server-side).
  const firstSession = calls[0].sessionId;
  await page.reload();
  await input(page).fill("What was my ticket about?");
  await send(page).click();
  await expect(page.getByText("হ্যালো! আমি নোভা।")).toBeVisible();
  expect(calls[1].sessionId).toBe(firstSession);
});

test("simulated task replies are labelled", async ({ page }) => {
  await mockChat(page, () => ({
    status: 200,
    json: { reply: "সিমুলেটেড টাস্ক তৈরি হয়েছে: ACT-1B9D6BCD (এটি বাস্তব টিকিট নয়)।" },
  }));
  await page.goto("/");
  await input(page).fill("Create a ticket for broken WiFi");
  await send(page).click();
  await expect(page.getByText("Simulated task")).toBeVisible();
});

test("server error shows a message and keeps the unsent text", async ({ page }) => {
  await mockChat(page, () => ({ status: 503, json: { error: "Nova is temporarily unavailable. Please retry." } }));
  await page.goto("/");
  await input(page).fill("Hello Nova");
  await send(page).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(input(page)).toHaveValue("Hello Nova");
});

test("voice toggle switches ON and OFF", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("switch", { name: "ভয়েস আউটপুট" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
});

test("unsupported voice input degrades gracefully", async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });
  await page.goto("/");
  await page.getByRole("button", { name: /মাইক্রোফোন/ }).click();
  await expect(page.getByText("Voice input is not supported in this browser")).toBeVisible();
  await expect(input(page)).toBeEnabled();
});

test("Talk mode is voice-only and shares the conversation with Chat", async ({ page }) => {
  await mockChat(page, () => ({ status: 200, json: { reply: "আমি SU Agent।" } }));
  await page.goto("/");
  await input(page).fill("তুমি কে?");
  await input(page).press("Enter");
  await expect(page.getByText("আমি SU Agent।")).toBeVisible();

  await page.getByRole("tab", { name: /কথা বলুন/ }).click();
  await expect(page.getByRole("img", { name: "SU Agent প্রস্তুত" })).toBeVisible();
  await expect(page.getByRole("button", { name: "কথা বলুন" }).last()).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0); // no typing in Talk mode
  await expect(page.getByText("আমি SU Agent।")).toBeVisible(); // same conversation, shown as caption
});

test("health endpoint responds", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect((await res.json()).status).toBe("ok");
});

test("invalid JSON to /api/chat returns 400", async ({ request }) => {
  const res = await request.post("/api/chat", { data: "{bad", headers: { "Content-Type": "application/json" } });
  expect(res.status()).toBe(400);
});
