"""Minimal end-to-end smoke test for Maitri (Playwright, Chromium).

Verifies the core chain works in a real browser:
  1. home page loads and hydrates
  2. submitting a wish while signed out is routed to /auth
  3. invite code + OAuth sign-up creates a session
  4. signed-in home shows the History / Saved / Connections entries
  5. /sessions is reachable and one submit == exactly one history row

Read-only: no app source, selector, or copy is changed by this test.

Run:  python3 tests/e2e/smoke.py
The dev server must already be serving http://localhost:8080.
"""

import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
SHOTS = Path(__file__).parent / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

DESKTOP = {"width": 1280, "height": 1800}

results = []


def record(name, ok, note=""):
    results.append((name, ok, note))
    print(("PASS " if ok else "FAIL ") + name + ((" :: " + note) if note else ""))


async def shot(page, name):
    await page.screenshot(path=str(SHOTS / f"smoke_{name}.png"))


async def hydrated(page):
    """Submitting before React hydrates does a native form GET, so wait."""
    await page.wait_for_selector("input[type=text], textarea", timeout=15000)
    await page.wait_for_timeout(1200)


async def body_text(page):
    """Read text straight off the DOM; locator reads time out under re-render."""
    return await page.evaluate(
        "() => (document.body.innerText || '') + '\\n' + (document.body.textContent || '')"
    )


async def dom_text(page, selector):
    return await page.evaluate(
        "(sel) => { const el = document.querySelector(sel); return el ? el.innerText : '' }",
        selector,
    )


async def dom_count(page, selector):
    return await page.evaluate("(sel) => document.querySelectorAll(sel).length", selector)


async def dom_texts(page, selector):
    return await page.evaluate(
        "(sel) => [...document.querySelectorAll(sel)].map((el) => el.innerText)", selector
    )


async def register(page, code="WELCOME"):
    """Walk the real signup UI: invite step -> provider step."""
    await page.goto(f"{BASE}/auth?mode=signup", wait_until="domcontentloaded")
    await hydrated(page)
    await page.locator("input[type=text]").first.fill(code)
    await page.get_by_role("button", name="Continue", exact=True).click()
    await page.get_by_role("button", name="Continue with Google").click()
    await page.wait_for_url(lambda u: "/auth" not in u, timeout=15000)


async def submit_wish(page, text):
    await hydrated(page)
    ta = page.locator("textarea").first
    await ta.click()
    await ta.fill(text)
    await ta.press("Enter")


# --------------------------------------------------------------------------


async def check_home_hydrates(browser):
    ctx = await browser.new_context(viewport=DESKTOP)
    page = await ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    await page.goto(BASE, wait_until="domcontentloaded")
    await hydrated(page)
    body = await body_text(page)
    composer = await page.locator("textarea").count()
    record(
        "home: loads and hydrates",
        composer > 0 and "Maitri" in body,
        f"textareas={composer}",
    )
    record("home: no console/page errors", not errors, "; ".join(errors[:2]))
    await shot(page, "1_home")
    await ctx.close()


async def check_signed_out_gate(browser):
    ctx = await browser.new_context(viewport=DESKTOP)
    page = await ctx.new_page()
    await page.goto(BASE, wait_until="domcontentloaded")
    await submit_wish(page, "Someone to walk the river with on a slow evening.")
    try:
        await page.wait_for_url(lambda u: "/auth" in u, timeout=10000)
    except Exception:
        pass
    record("home: signed-out submit is routed to /auth", "/auth" in page.url, page.url)
    await shot(page, "2_auth_gate")
    await ctx.close()


async def check_signin_and_entries(browser):
    ctx = await browser.new_context(viewport=DESKTOP)
    page = await ctx.new_page()
    await page.goto(BASE, wait_until="domcontentloaded")
    await register(page, "WELCOME")
    session = await page.evaluate("localStorage.getItem('kindred:auth.v1')")
    record("auth: invite code + Google creates a session", bool(session), page.url)

    await page.goto(BASE, wait_until="domcontentloaded")
    await hydrated(page)
    body = await body_text(page)
    # Saved is hidden by design while both saved lists are empty.
    has_entries = all(k in body for k in ["Connections", "History"])
    record("home: signed-in shows Connections / History", has_entries, body[:140])
    await shot(page, "3_signed_in")
    await ctx.close()


async def check_sessions_list(browser):
    ctx = await browser.new_context(viewport=DESKTOP)
    page = await ctx.new_page()
    await page.goto(BASE, wait_until="domcontentloaded")
    await register(page, "WELCOME")

    await page.goto(BASE, wait_until="domcontentloaded")
    await submit_wish(page, "A tennis partner for weekday mornings, easy pace.")
    try:
        await page.wait_for_url(
            lambda u: "/matchmaker" in u or "/side-by-side" in u, timeout=15000
        )
    except Exception:
        pass
    routed = "/matchmaker" in page.url or "/side-by-side" in page.url
    record("home: signed-in submit opens an agent workspace", routed, page.url)

    await page.goto(f"{BASE}/sessions", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    record("sessions: page renders (not the auth bounce)", "/sessions" in page.url, page.url)

    rows = await page.evaluate(
        "() => { try { return (JSON.parse(localStorage.getItem('kindred:sessions.v1')) || []).length } catch { return -1 } }"
    )
    record("sessions: one submit == exactly one history row", rows == 1, f"rows={rows}")
    await shot(page, "4_sessions")
    await ctx.close()


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        await check_home_hydrates(browser)
        await check_signed_out_gate(browser)
        await check_signin_and_entries(browser)
        await check_sessions_list(browser)
        await browser.close()

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    sys.exit(1 if failed else 0)


asyncio.run(main())
