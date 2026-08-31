"""End-to-end tests for AI chat message sending + reload persistence.

Covers both Agent workspaces:
  1. a wish typed on the home composer opens a session workspace
  2. messages sent inside the workspace are answered
  3. a full page reload of the same session URL restores every message
  4. a message sent after the reload is appended, not lost
  5. no runtime crash / blank screen at any point

Run:  python3 tests/e2e/chat_persistence.py
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
    await page.screenshot(path=str(SHOTS / f"{name}.png"))


async def hydrated(page):
    await page.wait_for_selector("input[type=text], textarea", timeout=15000)
    await page.wait_for_timeout(1200)


async def register(page, code="WELCOME"):
    await page.goto(f"{BASE}/auth?mode=signup", wait_until="domcontentloaded")
    await hydrated(page)
    invite = page.locator("input[type=text]").first
    await invite.click()
    await invite.press_sequentially(code, delay=40)
    await page.get_by_role("button", name="Continue", exact=True).click()
    google = page.get_by_role("button", name="Continue with Google")
    await google.wait_for(state="visible", timeout=10000)
    await google.click()
    for _ in range(30):
        if "/auth" not in page.url:
            return
        await page.wait_for_timeout(500)
    raise AssertionError(f"registration did not complete, still at {page.url}")


async def seed_profile(page):
    await page.evaluate(
        "p => localStorage.setItem('kindred:profile.v1', JSON.stringify(p))",
        {
            "avatar": "",
            "name": "Ada",
            "age": 30,
            "city": "Shanghai",
            "occupation": "Translator",
            "gender": "",
            "orientation": "",
            "mbti": "",
            "moments": [],
            "favorites": [],
            "hidden": [],
        },
    )


async def submit_wish(page, text):
    await page.goto(BASE, wait_until="domcontentloaded")
    await hydrated(page)
    ta = page.locator("textarea").first
    await ta.click()
    await ta.fill(text)
    await ta.press("Enter")
    await page.wait_for_url(
        lambda u: "/matchmaker" in u or "/side-by-side" in u, timeout=15000
    )


async def composer(page):
    el = page.get_by_test_id("agent-composer")
    await el.wait_for(state="visible", timeout=15000)
    return el


async def send_in_workspace(page, text):
    el = await composer(page)
    if await el.is_disabled():
        return False
    await el.click()
    await el.fill(text)
    await el.press("Enter")
    return True


async def wait_for_assistant(page, at_least, timeout=15000):
    try:
        await page.wait_for_function(
            """(n) => {
                const a = document.querySelectorAll('[data-testid="agent-msg-assistant"]').length;
                const thinking = document.querySelector('[data-testid="agent-thinking"]');
                return a >= n && !thinking;
            }""",
            arg=at_least,
            timeout=timeout,
        )
        return True
    except Exception:
        return False


async def transcript(page):
    """Read the rendered conversation straight out of the DOM."""
    return await page.evaluate(
        """() => {
            const pick = (sel) => Array.from(
              document.querySelectorAll(`[data-testid="${sel}"]`)
            ).map((n) => (n.innerText || '').trim());
            return { user: pick('agent-msg-user'), assistant: pick('agent-msg-assistant') };
        }"""
    )


async def assert_alive(page, label):
    body = await page.evaluate("() => (document.body.innerText || '').trim()")
    record(f"{label}: page renders (no blank screen)", len(body) > 20, body[:60].replace("\n", " | "))


async def reload_and_restore(page, label, expected_user, expected_assistant):
    url = page.url
    await page.reload(wait_until="domcontentloaded")
    await composer(page)
    ok = await page.wait_for_function(
        """(n) => document.querySelectorAll('[data-testid="agent-msg-user"]').length >= n""",
        arg=len(expected_user),
        timeout=15000,
    ) is not None
    await page.wait_for_timeout(800)
    t = await transcript(page)
    record(f"{label}: session URL survives reload", "session=" in url, url)
    record(
        f"{label}: every user message is restored after reload",
        all(any(e in got for got in t["user"]) for e in expected_user),
        f"{len(t['user'])} user rows",
    )
    record(
        f"{label}: assistant replies are restored after reload",
        len(t["assistant"]) >= expected_assistant,
        f"{len(t['assistant'])} assistant rows",
    )
    await assert_alive(page, f"{label} after reload")
    return t


# --------------------------------------------------------------------------


async def flow(context, wish, label, code, shot_prefix):
    page = await context.new_page()
    # Go straight to signup: landing on "/" first triggers the guard redirect
    # to /auth?mode=signin, which then races the signup navigation.
    await register(page, code)
    await seed_profile(page)

    await submit_wish(page, wish)
    record(f"{label}: wish opens a session workspace", "session=" in page.url, page.url)
    await wait_for_assistant(page, 1)

    m1 = "First follow-up, sent before the reload."
    sent = await send_in_workspace(page, m1)
    if sent:
        await wait_for_assistant(page, 2)
    t = await transcript(page)
    record(
        f"{label}: sent message appears in the transcript",
        any(m1 in u for u in t["user"]),
        f"user={len(t['user'])}",
    )
    record(
        f"{label}: the Agent answers",
        len(t["assistant"]) >= 1,
        f"assistant={len(t['assistant'])}",
    )
    await shot(page, f"{shot_prefix}1_before_reload")

    expected = [u for u in t["user"] if u]
    before_assistant = len(t["assistant"])
    t = await reload_and_restore(page, label, expected, before_assistant)
    await shot(page, f"{shot_prefix}2_after_reload")

    m2 = "Second follow-up, sent after the reload."
    sent = await send_in_workspace(page, m2)
    if sent:
        await wait_for_assistant(page, before_assistant + 1)
        await page.wait_for_timeout(600)
    t2 = await transcript(page)
    record(
        f"{label}: message sent after reload is appended",
        any(m2 in u for u in t2["user"]) and len(t2["user"]) > len(t["user"]),
        f"user={len(t2['user'])}",
    )
    record(
        f"{label}: older messages are not dropped by the new send",
        all(any(e in got for got in t2["user"]) for e in expected),
        f"user={len(t2['user'])}",
    )

    # Second reload: the post-reload message must persist too.
    await reload_and_restore(page, f"{label} (2nd reload)", expected + [m2], before_assistant)
    await shot(page, f"{shot_prefix}3_second_reload")
    await page.close()


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)

        ctx = await browser.new_context(viewport=DESKTOP)
        await flow(
            ctx,
            "Someone who reads on rainy evenings and walks home the long way.",
            "matchmaker",
            "WELCOME",
            "chat_mm_",
        )
        await ctx.close()

        ctx = await browser.new_context(viewport=DESKTOP)
        await flow(
            ctx,
            "Saturday morning tennis in Shanghai, casual level.",
            "side-by-side",
            "FRIENDS",
            "chat_sbs_",
        )
        await ctx.close()

        await browser.close()

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    sys.exit(1 if failed else 0)


asyncio.run(main())
