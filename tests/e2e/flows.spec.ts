import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync } from "node:fs";
import type { MetaResponse, ResearchResult } from "../../src/components/desk/types";

const SHOTS = "evidence/screenshots";
mkdirSync(SHOTS, { recursive: true });

const PUBLIC_ROUTES = ["/", "/how-it-works", "/method", "/about", "/desk"];

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page-wide horizontal overflow").toBeLessThanOrEqual(1);
}

function collectConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || (m.type() === "warning" && /hydrat|GSAP/i.test(m.text()))) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function confirmHold(page: Page, holding = "3000") {
  await page.goto("/desk");
  await expect(page.getByRole("heading", { level: 1, name: "Weekend decision desk" })).toBeVisible();
  await expect(page.getByLabel("Instrument")).toBeVisible();
  await page.getByText("Hold", { exact: true }).click();
  await page.getByLabel("Existing holding value (USDT)").fill(holding);
  await page.getByRole("button", { name: "Confirm intention" }).click();
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
}

async function runReplay(page: Page, key = "2026-09-26") {
  await page.getByText("Replay a past weekend").click();
  await page.getByLabel("Weekend to replay").selectOption(key);
  await page.getByRole("button", { name: "Stress-test my decision" }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
}

/** Test-only mutation of a real research response. The fixture never reaches a public page or the saved data. */
async function mutateResearch(page: Page, mutate: (j: ResearchResult) => void) {
  await page.route("**/api/research", async (route: Route) => {
    const res = await route.fetch();
    const j = (await res.json()) as ResearchResult;
    mutate(j);
    await route.fulfill({ response: res, json: j });
  });
  // Keep the model out of mutated-card tests to conserve quota.
  await page.route("**/api/explain", (route) => route.fulfill({ json: { ok: false, error: "Explanation skipped in this test" } }));
}

test("every public page renders without console errors, overflow or broken internal links", async ({ page, request }, info) => {
  const errors = collectConsole(page);
  const hrefs = new Set<string>();
  for (const path of PUBLIC_ROUTES) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("header").first()).toBeVisible();
    await expect(page.getByRole("contentinfo")).toContainText(`${new Date().getFullYear()} Reanchor`);
    await noHorizontalOverflow(page);
    const slug = path === "/" ? "landing" : path.slice(1);
    await page.screenshot({ path: `${SHOTS}/${slug}-${info.project.name}.png`, fullPage: true });
    for (const h of await page.locator("a[href^='/'], a[href^='#']").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""))) {
      hrefs.add(h.startsWith("#") ? `${path}${h}` : h);
    }
  }
  for (const h of hrefs) {
    const [p, anchor] = h.split("#");
    expect((await request.get(p || "/")).status(), h).toBe(200);
    if (anchor) {
      await page.goto(h);
      await expect(page.locator(`[id="${anchor}"]`), `anchor ${h}`).toHaveCount(1);
    }
  }
  expect(errors, errors.join("\n")).toEqual([]);
});

test("landing: hero, real replay, evidence, limitations and FAQ", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A weekend quote. A Monday decision.");
  for (const h of ["A weekend token price is not Monday's stock price.", "From a sentence to a decision you own.", "What the evidence does not show yet.", "Plain answers."]) {
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  }
  await expect(page.getByText(/cancellation timing not verified/i).first()).toBeVisible();
  await page.getByRole("link", { name: "See a real replay" }).click();
  await expect(page).toHaveURL(/#replay$/);
  const replay = page.locator("#replay");
  await expect(replay).toContainText("STAND DOWN");
  await expect(replay).toContainText(/rNVDA/);
  await page.getByRole("link", { name: "Open desk" }).first().click();
  await expect(page).toHaveURL(/\/desk$/);
});

test("header navigation marks the active route; mobile menu opens, closes on Escape and returns focus", async ({ page }, info) => {
  await page.goto("/method");
  if (info.project.name === "mobile") {
    const button = page.getByRole("button", { name: "Open menu" });
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.click();
    const menu = page.locator("#mobile-menu");
    await expect(menu).toBeVisible();
    await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    await expect(menu.getByRole("link", { name: "Method & evidence" })).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
    await page.getByRole("button", { name: "Open menu" }).click();
    await menu.getByRole("link", { name: "About" }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.locator("#mobile-menu")).toBeHidden();
  } else {
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: "Method & evidence" })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "How it works" }).click();
    await expect(page).toHaveURL(/\/how-it-works$/);
    await expect(nav.getByRole("link", { name: "How it works" })).toHaveAttribute("aria-current", "page");
  }
  // Anchored sections land below the sticky header.
  await page.goto("/method#evaluation");
  const top = await page.locator("#evaluation").evaluate((el) => el.getBoundingClientRect().top);
  const headerH = await page.locator("header").first().evaluate((el) => el.getBoundingClientRect().height);
  expect(top).toBeGreaterThanOrEqual(headerH - 1);
});

test("reduced motion: content is visible immediately and nothing is left hidden", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  for (const path of ["/", "/how-it-works", "/about"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const hidden = await page.evaluate(() =>
      [...document.querySelectorAll("[data-hero],[data-reveal],[data-hero-preview],[data-marker]")].filter((el) => {
        const s = getComputedStyle(el);
        return s.visibility === "hidden" || Number(s.opacity) < 0.99 || (s.transform !== "none" && s.transform !== "matrix(1, 0, 0, 1, 0, 0)");
      }).length,
    );
    expect(hidden, path).toBe(0);
  }
  await ctx.close();
});

test("structured replay flow produces one card, history, scenario and sources", async ({ page }, info) => {
  await confirmHold(page);
  await runReplay(page);
  const card = page.getByRole("article");
  await expect(card.getByRole("heading", { name: /STAND DOWN|TRIM/ })).toBeVisible();
  await expect(card.getByText("Historical replay", { exact: true })).toBeVisible();
  const cancelNote = card.getByRole("note").filter({ hasText: "Cancellation timing not verified" });
  await expect(cancelNote).toBeVisible();
  await expect(cancelNote).toContainText("switches back to regular trading on Monday's US stock market open");
  await expect(cancelNote).not.toContainText(/\d{1,2}:\d{2}/);
  await expect(card.getByText("Observed weekend-to-overnight transition", { exact: true }).locator("xpath=following-sibling::dd[1]")).toHaveText("Sun 2026-09-27 20:00 ET");
  await expect(card.getByText("Regular US cash-market open", { exact: true }).locator("xpath=following-sibling::dd[1]")).toHaveText("Mon 2026-09-28 09:30 ET");
  await expect(card.getByText("Only 1 matched same-direction extreme episodes (minimum 3)")).toBeVisible();
  // The reason is answered at a glance from the computed card: asked, compared, found, rule.
  await expect(card).toContainText("Not because the market is safe.");
  await expect(card.getByRole("img", { name: "1 matched comparable extreme weekends; 3 required" })).toBeVisible();
  await expect(card).toContainText("1 found · 3 required · threshold not met");
  await expect(card).toContainText("Hold: check whether to trim · rNVDA · holding 3,000 USDT");
  await expect(card).toContainText("Decision here");
  await expect(page.locator("#history")).toContainText("Prior weekends examined");
  await expect(page.locator("#realized")).toContainText("Everything below happened afterwards.");
  await expect(page.getByRole("heading", { name: "Stress test against prior reopenings" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Historical weekends" }).getByRole("row")).not.toHaveCount(1);
  await expect(page.getByRole("heading", { name: "What happened after this replay decision" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Case explanation" })).toBeVisible();
  await expect(page.locator("#case").getByText(/Every number was checked against the card|Case unavailable\. Computed results remain available\./)).toBeVisible({ timeout: 90_000 });
  const slider = page.getByLabel(/Underlying reopening gap vs official close/);
  const before = await page.getByText("Token endpoint implied").locator("xpath=following-sibling::dd").textContent();
  await slider.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
  await expect(page.getByText(/Underlying reopening gap vs official close: -5\.0%/)).toBeVisible();
  const after = await page.getByText("Token endpoint implied").locator("xpath=following-sibling::dd").textContent();
  expect(after).not.toBe(before);
  await expect(card.getByRole("heading", { name: /STAND DOWN|TRIM/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sources and timestamps" })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: `${SHOTS}/desk-result-${info.project.name}.png`, fullPage: true });

  await page.getByLabel("Weekend to replay").selectOption("2026-09-19");
  await page.getByRole("button", { name: "Stress-test my decision" }).click();
  await expect(card.getByText("Observed weekend-to-overnight transition", { exact: true }).locator("xpath=following-sibling::dd[1]")).toHaveText("Sun 2026-09-20 20:00 ET");
});

test("sources: card list with expandable detail on phones, table from tablet width", async ({ page }, info) => {
  await page.route("**/api/explain", (route) => route.fulfill({ json: { ok: false, error: "Explanation skipped in this test" } }));
  await confirmHold(page);
  await runReplay(page);
  const section = page.locator("#sources");
  if (info.project.name === "mobile") {
    const list = section.getByRole("list", { name: "Sources" });
    await expect(list).toBeVisible();
    await expect(section.getByRole("region", { name: "Sources table" })).toBeHidden();
    const first = list.getByRole("listitem").first();
    await first.getByText("Source and detail").click();
    await expect(first).toContainText(/data\/|Bitget|Nasdaq/);
  } else {
    await expect(section.getByRole("region", { name: "Sources table" })).toBeVisible();
    await expect(section.getByRole("region", { name: "Sources table" }).getByRole("row")).not.toHaveCount(1);
  }
  await noHorizontalOverflow(page);
});

test("missing turnover is shown as unavailable, never as a number", async ({ page }) => {
  await mutateResearch(page, (j) => {
    j.card.ht.value = null;
    j.card.sizing.proposedParticipation = null;
  });
  await confirmHold(page);
  await runReplay(page);
  const card = page.getByRole("article");
  await expect(card.getByText("H_t hourly turnover", { exact: true }).locator("xpath=following-sibling::dd[1]")).toHaveText("Unavailable");
  await expect(card.getByText("Participation", { exact: true }).locator("xpath=following-sibling::dd[1]")).toHaveText("n/a");
});

test("unknown underlying anchor is labeled UNKNOWN and disables the stock-linked scenario", async ({ page }) => {
  await mutateResearch(page, (j) => {
    j.card.underlying = { fridayClose: null, fridayCloseDate: null, reopenOpen: null, reopenOpenDate: null, source: "test", status: "UNKNOWN", note: "Anchor unavailable in this test" };
  });
  await confirmHold(page);
  await runReplay(page);
  const card = page.getByRole("article");
  await expect(card.getByText(/official close$/).locator("xpath=following-sibling::dd[1]")).toHaveText("UNKNOWN");
  await expect(card.getByText("Underlying reopening open", { exact: true }).locator("xpath=following-sibling::dd[1]")).toHaveText("Not printed");
  await expect(page.locator("#scenario")).not.toContainText("Underlying implied");
});

test("stale observation is labeled stale with its age", async ({ page }) => {
  await mutateResearch(page, (j) => {
    j.card.observation.ageMinutes = 240;
    j.card.observation.fresh = false;
  });
  await confirmHold(page);
  await runReplay(page);
  await expect(page.getByRole("article").getByText("240 min old at decision; stale")).toBeVisible();
});

test("model unavailable: parsing disabled with a reason, structured form and explanation fallback still work", async ({ page }) => {
  await page.route("**/api/meta", async (route) => {
    const res = await route.fetch();
    const j = (await res.json()) as MetaResponse;
    j.model = { available: false, model: j.model?.model ?? "none", reason: "No model is configured (test)" };
    await route.fulfill({ response: res, json: j });
  });
  await page.goto("/desk");
  await expect(page.getByText("Model unavailable")).toBeVisible();
  await page.getByLabel("Your intention").fill("I hold $3,000 of rNVDA and want to check whether to trim");
  await expect(page.getByRole("button", { name: "Extract fields" })).toBeDisabled();
  await expect(page.getByText(/Natural-language parsing is unavailable on this server \(No model is configured \(test\)\)/)).toBeVisible();
  await page.getByText("Hold", { exact: true }).click();
  await page.getByLabel("Existing holding value (USDT)").fill("3000");
  await page.getByRole("button", { name: "Confirm intention" }).click();
  await runReplay(page);
  await expect(page.locator("#case").getByText("Case unavailable. Computed results remain available.")).toBeVisible();
  await expect(page.getByRole("article").getByRole("heading", { name: /STAND DOWN|TRIM/ })).toBeVisible();
});

test("form confirmation: research stays blocked until confirmed, and any edit clears the confirmation", async ({ page }) => {
  await page.goto("/desk");
  const runButton = page.getByRole("button", { name: "Stress-test my decision" });
  await expect(runButton).toBeDisabled();
  await page.getByText("Hold", { exact: true }).click();
  await page.getByLabel("Existing holding value (USDT)").fill("2000");
  await expect(runButton).toBeDisabled();
  await page.getByRole("button", { name: "Confirm intention" }).click();
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(runButton).toBeEnabled();
  await page.getByLabel("Existing holding value (USDT)").fill("2500");
  await expect(page.getByText("Confirmed", { exact: true })).toBeHidden();
  await expect(runButton).toBeDisabled();
});

test("natural-language flow: extract, confirm, research and grounded explanation", async ({ page }, info) => {
  const meta = await (await page.request.get("/api/meta")).json();
  test.skip(!meta.model.available, "No model configured on this server");
  test.skip(info.project.name !== "desktop", "Model calls limited to one width to respect free-tier quota; explanations are cached server-side");
  await page.goto("/desk");
  await page.getByLabel("Your intention").fill("I want to sell 500 of my 2000 USDT rNVDA position at 240");
  await page.getByRole("button", { name: "Extract fields" }).click();
  await expect(page.getByText(/Fields extracted by gemini|Some details are missing|Could not read that sentence/)).toBeVisible({ timeout: 90_000 });
  const extracted = await page.getByText(/Fields extracted by gemini/).isVisible();
  if (!extracted) test.skip(true, "Model unavailable or rate-limited during this run; fallback message shown");
  await expect(page.getByLabel("Existing holding value (USDT)")).toHaveValue("2000");
  await expect(page.getByLabel("Proposed sale size (USDT)")).toHaveValue("500");
  await expect(page.getByLabel("Proposed limit price (USDT per token)")).toHaveValue("240");
  await expect(page.getByText("From your text").first()).toBeVisible();
  await expect(page.getByText("You said", { exact: true })).toBeVisible();
  await expect(page.getByText("Gemini extracted", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stress-test my decision" })).toBeDisabled();
  await page.getByRole("button", { name: "Confirm intention" }).click();
  await runReplay(page);
  await expect(page.getByRole("article").getByRole("heading", { name: /STAND DOWN|FADE/ })).toBeVisible();
  const caseBox = page.locator("#case");
  await expect(caseBox.getByText(/Every number was checked against the card|Case unavailable\. Computed results remain available\./)).toBeVisible({ timeout: 90_000 });
  if (await caseBox.getByText(/Every number was checked against the card/).isVisible()) {
    await expect(caseBox).toContainText(/STAND DOWN|FADE/);
    await expect(caseBox).toContainText("not verified");
    await expect(caseBox).toContainText("Model: gemini");
  }
  await page.screenshot({ path: `${SHOTS}/desk-nl-${info.project.name}.png`, fullPage: true });
});

test("missing limit and ambiguous inputs block confirmation with clear messages", async ({ page }) => {
  await page.goto("/desk");
  await page.getByText("Buy the dip", { exact: true }).click();
  await page.getByLabel("Proposed buy size (USDT)").fill("500");
  await expect(page.getByText("Enter a proposed limit price in USDT per token")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm intention" })).toBeDisabled();
  await page.getByLabel("Proposed limit price (USDT per token)").fill("abc");
  await expect(page.getByText("Enter a number")).toBeVisible();
  await page.getByLabel("Proposed limit price (USDT per token)").fill("230");
  await expect(page.getByRole("button", { name: "Confirm intention" })).toBeEnabled();
  await page.getByText("Sell into a pop", { exact: true }).click();
  await page.getByLabel("Existing holding value (USDT)").fill("100");
  await page.getByLabel("Proposed sale size (USDT)").fill("500");
  await expect(page.getByText("You cannot sell more than you hold; no short selling is modeled")).toBeVisible();
  await page.getByLabel("Existing holding value (USDT)").fill("60000");
  await expect(page.getByText(/capped at 50,000 USDT/)).toBeVisible();
});

test("provider failure and live outside-session states are explained", async ({ page }) => {
  await confirmHold(page);
  await page.route("**/api/research", (route) => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Research could not be completed. A provider may be unavailable; try a replay." }) }));
  await page.getByText("Replay a past weekend").click();
  await page.getByRole("button", { name: "Stress-test my decision" }).click();
  await expect(page.getByText("Research could not be completed", { exact: true })).toBeVisible();
  await page.unroute("**/api/research");
  await page.route("**/api/explain", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false, fallback: "Case unavailable. Computed results remain available.", error: "Explanation discarded: ungrounded number 999" }) }));
  await page.getByText("Live weekend", { exact: true }).click();
  await page.getByRole("button", { name: "Stress-test my decision" }).click();
  const card = page.getByRole("article");
  await expect(card.getByText("Live weekend data")).toBeVisible({ timeout: 90_000 });
  await expect(card.getByRole("heading", { name: /STAND DOWN|TRIM/ })).toBeVisible();
  await expect(page.getByText("Case unavailable. Computed results remain available.")).toBeVisible();
  await expect(page.locator("#sources")).toContainText(/Live|Failed/);
});

test("keyboard: skip link, CTA focus ring, and desk controls reachable", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByText("Skip to content")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  const cta = page.locator("main").getByRole("link", { name: "Open desk" }).first();
  let reached = false;
  for (let i = 0; i < 12 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await cta.evaluate((el) => el === document.activeElement);
  }
  expect(reached).toBe(true);
  expect(await cta.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/desk$/);
  await page.getByLabel("Your intention").focus();
  let onSelect = false;
  for (let i = 0; i < 6 && !onSelect; i++) {
    await page.keyboard.press("Tab");
    onSelect = await page.getByLabel("Instrument").evaluate((el) => el === document.activeElement);
  }
  expect(onSelect).toBe(true);
  let onRadio = false;
  for (let i = 0; i < 4 && !onRadio; i++) {
    await page.keyboard.press("Tab");
    onRadio = await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type === "radio");
  }
  expect(onRadio).toBe(true);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByLabel("Proposed buy size (USDT)")).toBeVisible();
});

test("method page shows coverage for all candidates and every anchored section", async ({ page }) => {
  await page.goto("/method");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("How every number is made, and what is still unknown.");
  const coverage = page.getByRole("region", { name: "Coverage by instrument" });
  for (const coin of ["rNVDA", "rTSLA", "rAAPL", "rMSFT", "rAMZN", "rMETA", "rQQQ"]) await expect(coverage).toContainText(coin);
  await expect(coverage.getByText("Supported")).toHaveCount(1);
  for (const id of ["coverage", "sessions", "measurement", "turnover", "signals", "sizing", "evaluation", "provenance", "integrations", "assumptions"]) {
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  }
  await expect(page.locator("#integrations")).toContainText("Agent Hub");
});

test("metadata: title, description, social tags, icon and theme color on every public page; no localhost URLs", async ({ page }) => {
  for (const path of PUBLIC_ROUTES) {
    await page.goto(path);
    expect(await page.title(), path).toMatch(/Reanchor/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.{40,}/);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /Reanchor|\|/);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", /.{40,}/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#183338");
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", /\/icon\.svg/);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(1);
    expect(await page.content(), path).not.toMatch(/https?:\/\/localhost/);
  }
  const icon = await page.request.get("/icon.svg");
  expect(icon.status()).toBe(200);
  expect(await icon.text()).toContain("M12 8.6V18.6");
  expect((await page.request.get("/favicon.ico")).status()).toBe(404);
  const card = await page.request.get("/social-card");
  expect(card.headers()["content-type"]).toContain("image/png");
});

test("desk at 1440/1280/1024/768/390: decision lands in view after a run, no overflow, 44px targets", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop", "Iterates all five widths itself");
  for (const width of [1440, 1280, 1024, 768, 390]) {
    const mobile = width < 500;
    const ctx = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    await page.route("**/api/explain", (route) => route.fulfill({ json: { ok: false, error: "Explanation skipped in this test" } }));
    await confirmHold(page, "2000");
    await runReplay(page);
    const heading = page.getByRole("article").getByRole("heading", { level: 2 });
    await expect(heading).toBeInViewport();
    const headerBottom = await page.locator("header").first().evaluate((el) => el.getBoundingClientRect().bottom);
    const headingTop = await heading.evaluate((el) => el.getBoundingClientRect().top);
    expect(headingTop, `${width}px: decision heading hidden under the sticky header`).toBeGreaterThanOrEqual(headerBottom);
    await noHorizontalOverflow(page);
    // Single column below 1280 so results get the full width; two columns from 1280.
    const [form, card] = await Promise.all([page.locator("#confirm").boundingBox(), page.getByRole("article").boundingBox()]);
    if (width >= 1280) expect(card!.x, `${width}px: two columns`).toBeGreaterThan(form!.x + form!.width);
    else expect(Math.abs(card!.x - form!.x), `${width}px: single column`).toBeLessThanOrEqual(1);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll("main button, main select, main input:not([type=radio]):not([type=range]), main textarea, main label:has(input[type=radio]), main summary")]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && r.height < 43.5)
        .map(({ el, r }) => `${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.height)}px`),
    );
    expect(small, `${width}px: controls under 44px`).toEqual([]);
    await page.screenshot({ path: `${SHOTS}/desk-after-run-${width}.png` });
    await ctx.close();
  }
});

test("the decision card renders the computed action, not a fixed STAND DOWN", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Rendering check; one width is enough");
  // Test-only mutation of a real research response: the engine's TRIM path is covered by unit tests; this proves the UI follows card.action.
  await mutateResearch(page, (j) => {
    j.card.action = "TRIM";
    j.card.side = "SELL";
    j.card.standDownReasons = [];
    j.card.sizing.modeledClipUsdt = 200;
    j.card.sizing.quantity = 0.89;
  });
  await confirmHold(page, "2000");
  await runReplay(page);
  const card = page.getByRole("article");
  await expect(card.getByRole("heading", { level: 2 })).toContainText("TRIM");
  await expect(card).not.toContainText("Why the desk stands down");
  await expect(card).toContainText("200.00 USDT");
});
