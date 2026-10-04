// Takes every README screenshot with Microsoft Edge.   1) npm run dev:local   2) npm run screenshots
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3021";
const OUT = new URL("../../../docs/screenshots/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
mkdirSync(`${OUT}desktop`, { recursive: true });
mkdirSync(`${OUT}mobile`, { recursive: true });

const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });

async function session(kind, lang = "ar", theme = "light") {
  const mobile = kind === "mobile";
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile, hasTouch: mobile, locale: lang === "ar" ? "ar-SA" : "en-GB",
    geolocation: { latitude: 24.7136, longitude: 46.6753 }, permissions: ["geolocation"],
  });
  await ctx.addInitScript(([l, t]) => { try { localStorage.setItem("masar-lang", l); localStorage.setItem("masar-theme", t); } catch {} }, [lang, theme]);
  const page = await ctx.newPage();
  return { ctx, page };
}

const settle = async (page, ms = 1400) => { await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForTimeout(ms); };
// Tall pages: grow the viewport to the content height (fullPage would repeat the sticky header in the middle).
const shot = async (page, kind, name, full = false) => {
  await settle(page);
  const vp = page.viewportSize();
  if (full) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: vp.width, height: Math.min(Math.max(h, vp.height), 2600) });
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: `${OUT}${kind}/${name}.png` });
  if (full) await page.setViewportSize(vp);
  console.log("•", kind, name);
};
const roleLabel = { admin: "مدير النظام", dispatcher: "منسّق العمليات", finance: "المحاسب", client: "عميل", driver: "سائق" };
const roleLabelEn = { admin: "Administrator", dispatcher: "Dispatcher", finance: "Finance", client: "Client", driver: "Driver" };

async function login(page, role, lang = "ar") {
  await page.goto(`${BASE}/login/`);
  await page.getByRole("button", { name: new RegExp((lang === "ar" ? roleLabel : roleLabelEn)[role]) }).first().click();
  await page.waitForURL(/\/app\//, { timeout: 15000 });
  await settle(page, 800);
}
const go = async (page, path) => { await page.goto(`${BASE}${path}`); await settle(page); };
const ids = async (page) => page.evaluate(async () => {
  const api = window.__masarApi;
  const live = await api("/tracking/live");
  const inTransit = live.waybills.find((w) => w.stage === "in_transit") ?? live.waybills[0];
  const delivered = (await api("/waybills?status=delivered&size=1")).items[0];
  const verified = (await api("/waybills?status=verified&size=1")).items[0];
  const inv = (await api("/invoices?status=issued,partial,paid")).find((i) => i.lines_count > 1) ?? (await api("/invoices?status=issued,partial,paid"))[0];
  const full = await api(`/waybills/${delivered.id}`);
  return { transit: inTransit.id, transitNo: inTransit.number, delivered: delivered.id, deliveredNo: delivered.number, otp: full.otp, inv: inv.id, verified: verified?.id };
});

// ------------------------------------------------------------ desktop (Arabic, light)
{
  const { ctx, page } = await session("desktop");
  await page.goto(`${BASE}/login/`); await shot(page, "desktop", "01-login");
  await login(page, "admin");
  await shot(page, "desktop", "02-dashboard", true);
  const id = await ids(page);
  await go(page, "/app/waybills/"); await shot(page, "desktop", "03-waybills");
  await go(page, `/app/waybill/?id=${id.transit}`); await shot(page, "desktop", "04-waybill-in-transit", true);
  await go(page, `/app/waybill/?id=${id.delivered}`); await shot(page, "desktop", "05-waybill-delivered-pod", true);
  await go(page, "/app/waybill-form/");
  await page.waitForTimeout(600);
  await page.locator('select:has(option:text-is("اختر المرسل…"))').selectOption({ index: 2 });
  await page.waitForTimeout(900);
  await page.locator('select:has(option:text-is("اختر المستلم…"))').selectOption({ index: 1 });
  await page.waitForTimeout(500);
  await page.getByPlaceholder("WB-2026-00001").count();
  const inputs = page.locator('input[type="number"]');
  await inputs.nth(1).fill("1800").catch(() => {});
  await page.locator("select:has(option:text-is('بدون سائق'))").selectOption({ index: 1 }).catch(() => {});
  await shot(page, "desktop", "06-waybill-form", true);
  await go(page, `/app/waybill-print/?id=${id.delivered}`); await shot(page, "desktop", "07-waybill-print", true);
  await go(page, "/app/dispatch/"); await shot(page, "desktop", "08-dispatch-board");
  await go(page, "/app/tracking/"); await page.waitForTimeout(2500); await shot(page, "desktop", "09-live-tracking");
  await go(page, "/app/delivery/"); await shot(page, "desktop", "10-delivery-grid");
  await go(page, "/app/billing/"); await shot(page, "desktop", "11-billing-verify");
  await go(page, "/app/invoices/"); await shot(page, "desktop", "12-invoices");
  await go(page, `/app/invoice/?id=${id.inv}`); await shot(page, "desktop", "13-invoice", true);
  await go(page, "/app/cod/"); await shot(page, "desktop", "14-cod-cash");
  await go(page, "/app/reports/"); await shot(page, "desktop", "15-reports-trip-sheet");
  await go(page, "/app/senders/"); await shot(page, "desktop", "16-senders");
  await go(page, "/app/drivers/"); await shot(page, "desktop", "17-drivers");
  await go(page, "/app/vehicles/"); await shot(page, "desktop", "18-vehicles");
  await go(page, "/app/tariffs/"); await shot(page, "desktop", "19-tariffs");
  await go(page, "/app/users/"); await shot(page, "desktop", "20-users");
  await go(page, "/app/settings/"); await shot(page, "desktop", "21-settings", true);
  await go(page, `/track/?n=${id.deliveredNo}`);
  await page.locator('input[inputmode="numeric"]').fill(id.otp);
  await page.getByRole("button", { name: /تتبّع/ }).click();
  await page.waitForTimeout(1200);
  await shot(page, "desktop", "22-public-tracking", true);
  await ctx.close();
}

// ---------------------------------------------- desktop: client portal, English, dark
{
  const { ctx, page } = await session("desktop");
  await login(page, "client"); await shot(page, "desktop", "23-client-portal", true);
  await go(page, "/app/waybills/"); await shot(page, "desktop", "24-client-waybills");
  await ctx.close();
}
{
  const { ctx, page } = await session("desktop", "en");
  await login(page, "dispatcher", "en"); await shot(page, "desktop", "25-english-dashboard");
  await go(page, "/app/dispatch/"); await shot(page, "desktop", "26-english-dispatch");
  await ctx.close();
}
{
  const { ctx, page } = await session("desktop", "ar", "dark");
  await login(page, "admin"); await shot(page, "desktop", "27-dark-dashboard", true);
  await ctx.close();
}

// ------------------------------------------------------------------ mobile (driver app + client)
{
  const { ctx, page } = await session("mobile");
  await page.goto(`${BASE}/login/`); await shot(page, "mobile", "01-login");
  await login(page, "driver");
  await shot(page, "mobile", "02-driver-jobs", true);
  const first = page.locator('a[href*="/app/job/?id"]').first();
  await first.click(); await settle(page);
  await shot(page, "mobile", "03-driver-job");
  // walk one job to the proof-of-delivery step
  for (const label of [/قبول المهمة|تم استلام الشحنة|بدء الرحلة|وصلت إلى الوجهة/]) {
    for (let i = 0; i < 4; i++) {
      const btn = page.getByRole("button", { name: label }).first();
      if (await btn.count()) { await btn.click(); await page.waitForTimeout(900); }
    }
  }
  const deliver = page.getByRole("button", { name: /تسليم الشحنة/ }).first();
  if (await deliver.count()) {
    await deliver.click(); await page.waitForTimeout(500);
    await page.locator("input").first().fill("خالد العتيبي");
    const c = page.locator("canvas");
    const b = await c.boundingBox();
    if (b) { await page.mouse.move(b.x + 30, b.y + 60); await page.mouse.down(); await page.mouse.move(b.x + 120, b.y + 20, { steps: 8 }); await page.mouse.move(b.x + 200, b.y + 90, { steps: 8 }); await page.mouse.move(b.x + 280, b.y + 40, { steps: 8 }); await page.mouse.up(); }
    await shot(page, "mobile", "04-driver-proof-of-delivery");
  }
  await ctx.close();
}
{
  const { ctx, page } = await session("mobile");
  await login(page, "client"); await shot(page, "mobile", "05-client-dashboard", true);
  await go(page, "/app/waybills/"); await shot(page, "mobile", "06-client-waybills");
  await ctx.close();
}
{
  const { ctx, page } = await session("mobile");
  await login(page, "dispatcher"); await go(page, "/app/dispatch/"); await shot(page, "mobile", "07-dispatch");
  await go(page, "/app/tracking/"); await page.waitForTimeout(2500); await shot(page, "mobile", "08-live-tracking");
  await ctx.close();
}
await browser.close();
console.log("done");
