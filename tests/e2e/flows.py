"""End-to-end flows for Maitri (Playwright, Chromium).

Covers the paths that keep breaking in review:
  1. invite-gated registration (bad code rejected, good code accepted)
  2. Introduce Someone: wish -> result
  3. Say hello gating for an incomplete profile (-> /profile)
  4. profile completion -> return to the same result + open composer
  5. an already-complete profile is NOT asked again
  6. mobile: chats master->detail + back, Me hub rows, Saved drawer

Run:  python3 tests/e2e/flows.py
The dev server must already be serving http://localhost:8080.
"""

import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright, expect

BASE = "http://localhost:8080"
SHOTS = Path(__file__).parent / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

DESKTOP = {"width": 1280, "height": 1800}
IPHONE = {"width": 390, "height": 844}

results = []


def record(name, ok, note=""):
    results.append((name, ok, note))
    print(("PASS " if ok else "FAIL ") + name + ((" :: " + note) if note else ""))


async def shot(page, name):
    await page.screenshot(path=str(SHOTS / f"{name}.png"))


async def hydrated(page):
    """Submitting before React hydrates does a native form GET, so wait."""
    await page.wait_for_selector("input[type=text], textarea", timeout=15000)
    await page.wait_for_timeout(1200)


async def register(page, code="WELCOME"):
    """Walk the real signup UI: invite step -> provider step."""
    await page.goto(f"{BASE}/auth?mode=signup", wait_until="domcontentloaded")
    await hydrated(page)
    await page.locator("input[type=text]").first.fill(code)
    await page.get_by_role("button", name="Continue", exact=True).click()
    await page.get_by_role("button", name="Continue with Google").click()
    await page.wait_for_url(lambda u: "/auth" not in u, timeout=15000)


async def seed_profile(page, complete=True):
    """Write a profile straight into localStorage (the app's own store)."""
    profile = {
        "avatar": "", "name": "Ada" if complete else "",
        "age": 30 if complete else None,
        "city": "Lisbon" if complete else "",
        "occupation": "Translator" if complete else "",
        "gender": "", "orientation": "", "mbti": "",
        "moments": [], "favorites": [], "hidden": [],
    }
    await page.evaluate(
        "p => localStorage.setItem('kindred:profile.v1', JSON.stringify(p))", profile
    )


async def submit_wish(page, text):
    await hydrated(page)
    ta = page.locator("textarea").first
    await ta.click()
    await ta.fill(text)
    await ta.press("Enter")
    await page.wait_for_url(lambda u: "/matchmaker" in u or "/side-by-side" in u, timeout=15000)


# --------------------------------------------------------------------------


async def flow_registration(context):
    page = await context.new_page()
    await page.goto(f"{BASE}/auth?mode=signup", wait_until="domcontentloaded")
    await hydrated(page)

    await page.locator("input[type=text]").first.fill("TOTALLY-BOGUS")
    await page.get_by_role("button", name="Continue", exact=True).click()
    await page.wait_for_timeout(600)
    body = await page.locator("body").inner_text()
    record("registration: invalid invite is rejected", "isn't valid" in body, body[:120])

    await page.locator("input[type=text]").first.fill("WELCOME")
    await page.get_by_role("button", name="Continue", exact=True).click()
    await page.get_by_role("button", name="Continue with Google").click()
    await page.wait_for_url(lambda u: "/auth" not in u, timeout=15000)
    user = await page.evaluate("localStorage.getItem('kindred:auth.v1')")
    record("registration: valid invite creates a session", bool(user), page.url)
    await shot(page, "1_registered")
    await page.close()


async def flow_say_hello_gate(context):
    page = await context.new_page()
    await page.goto(BASE, wait_until="domcontentloaded")
    await register(page, "FRIENDS")
    await seed_profile(page, complete=False)

    await page.goto(BASE, wait_until="domcontentloaded")
    await submit_wish(page, "Someone who reads on rainy evenings and walks home the long way.")
    await page.wait_for_timeout(2500)
    result_url = page.url
    await shot(page, "2_result")
    record("introduce: wish produces a result page", "/matchmaker" in result_url, result_url)

    hello = page.get_by_role("button", name="Say hello")
    if await hello.count() == 0:
        record("introduce: say hello button present", False, "no Say hello button rendered")
        await page.close()
        return
    await hello.first.click()
    await page.wait_for_timeout(1500)
    gated = "/profile" in page.url
    record("say hello: incomplete profile is gated to /profile", gated, page.url)
    await shot(page, "3_gated")

    # Complete the profile the way a user would, then come back.
    await seed_profile(page, complete=True)
    await page.reload(wait_until="domcontentloaded")
    await page.wait_for_timeout(800)
    # The profile header's first control is the contextual return
    # ("Back to introductions" when we were gated out of a match).
    back = page.locator("header button").first
    try:
        await back.click(timeout=5000)
    except Exception:
        pass
    await page.wait_for_timeout(2000)
    returned = "/matchmaker" in page.url
    record("profile completion returns to the result", returned, page.url)
    await shot(page, "4_returned")

    if returned:
        hello = page.get_by_role("button", name="Say hello")
        if await hello.count() > 0:
            await hello.first.click()
            await page.wait_for_timeout(1500)
            not_gated = "/profile" not in page.url
            record("say hello: complete profile is NOT re-asked", not_gated, page.url)
            await shot(page, "5_hello")
    await page.close()


async def flow_mobile(browser):
    context = await browser.new_context(viewport=IPHONE, is_mobile=True, has_touch=True)
    page = await context.new_page()
    await page.goto(BASE, wait_until="domcontentloaded")
    await register(page, "KINDRED2026")
    await seed_profile(page, complete=True)

    # Chats: empty state first.
    await page.goto(f"{BASE}/connections", wait_until="domcontentloaded")
    await page.wait_for_timeout(1200)
    empty = await page.get_by_test_id("chats-empty").count()
    listed = await page.get_by_test_id("chats-list").count()
    record("mobile chats: shows list or empty state (never blank)", empty + listed > 0)
    await shot(page, "6_chats")

    if listed:
        rows = page.locator("[data-testid='chats-list'] li")
        await rows.first.click()
        await page.wait_for_timeout(800)
        opened = await page.get_by_test_id("chats-list").count() == 0
        record("mobile chats: tapping a row opens the thread", opened)
        await page.get_by_role("button", name="Back").first.click()
        await page.wait_for_timeout(600)
        record("mobile chats: back returns to the list",
               await page.get_by_test_id("chats-list").count() > 0)

    # Me hub.
    await page.goto(f"{BASE}/me", wait_until="domcontentloaded")
    await page.wait_for_timeout(1000)
    text = await page.locator("body").inner_text()
    has_rows = all(k in text for k in ["Your profile", "Saved", "Invites", "Sign out"])
    record("mobile me: profile / saved / invites / sign out all present", has_rows, text[:140])
    await shot(page, "7_me")

    await page.get_by_text("Saved", exact=True).first.click()
    await page.wait_for_timeout(900)
    drawer = await page.get_by_role("dialog").count()
    record("mobile me: Saved opens the saved drawer", drawer > 0)
    await shot(page, "8_saved")
    await context.close()


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)

        ctx = await browser.new_context(viewport=DESKTOP)
        await flow_registration(ctx)
        await ctx.close()

        ctx = await browser.new_context(viewport=DESKTOP)
        await flow_say_hello_gate(ctx)
        await ctx.close()

        await flow_mobile(browser)
        await browser.close()

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    sys.exit(1 if failed else 0)


asyncio.run(main())
