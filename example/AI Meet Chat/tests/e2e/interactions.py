"""Extra end-to-end interaction coverage for Maitri (Playwright, Chromium).

Adds three groups of assertions on top of tests/e2e/smoke.py:

  A. profile editing   — /profile renders, autosaves, progress copy updates
  B. invite codes      — empty / invalid / whitespace-case / single-use
  C. session detail    — history row -> workspace with ?session=, then back

Read-only: no app source, selector, or copy is changed by this test.

Run:  python3 tests/e2e/interactions.py
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
    try:
        await page.screenshot(path=str(SHOTS / f"interactions_{name}.png"), timeout=10000)
    except Exception:
        pass


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
    google = page.get_by_role("button", name="Continue with Google")
    await google.wait_for(state="visible", timeout=10000)
    await google.click()
    await page.wait_for_url(lambda u: "/auth" not in u, timeout=15000)


async def submit_wish(page, text):
    await hydrated(page)
    ta = page.locator("textarea").first
    await ta.click()
    await ta.fill(text)
    await ta.press("Enter")


# --------------------------------------------------------------------------
# A. profile editing
#
# The profile form re-renders on every autosave, so element handles detach
# mid-action. Values are set through a React-compatible native input event
# and read straight off the DOM, which is stable under that churn.

SET_FIELD_JS = """
([label, value]) => {
  const wrap = [...document.querySelectorAll('label')]
    .find((l) => l.textContent.trim().startsWith(label));
  const el = wrap && wrap.querySelector('input');
  if (!el) return false;
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}
"""

READ_FIELD_JS = """
(label) => {
  const wrap = [...document.querySelectorAll('label')]
    .find((l) => l.textContent.trim().startsWith(label));
  const el = wrap && wrap.querySelector('input');
  return el ? el.value : null;
}
"""


async def set_field(page, label, value):
    ok = await page.evaluate(SET_FIELD_JS, [label, value])
    await page.wait_for_timeout(250)
    return ok


async def read_field(page, label):
    return await page.evaluate(READ_FIELD_JS, label)


async def check_profile_editing(browser):
    ctx = await browser.new_context(viewport=DESKTOP)
    page = await ctx.new_page()
    await page.goto(BASE, wait_until="domcontentloaded")
    await register(page, "WELCOME")

    await page.goto(f"{BASE}/profile", wait_until="domcontentloaded")
    await hydrated(page)
    body = await body_text(page)
    record(
        "profile: renders for a signed-in user (no auth bounce)",
        "/profile" in page.url and "Step 0 of 3" in body,
        page.url + " :: " + body[:120],
    )

    filled = []
    for label, value in [
        ("Name", "Ada Lovelace"),
        ("Age", "30"),
        ("City", "Lisbon"),
        ("What you do", "Translator"),
    ]:
        filled.append(await set_field(page, label, value))
    record("profile: all vitals fields are editable", all(filled), str(filled))
    await page.wait_for_timeout(1200)

    body = await body_text(page)
    record(
        "profile: completing vitals advances the progress copy",
        "Step 1 of 3" in body,
        body[:120],
    )

    stored = await page.evaluate(
        "() => { try { return JSON.parse(localStorage.getItem('kindred:profile.v1')) } catch { return null } }"
    )
    record(
        "profile: edits are persisted to the profile store",
        bool(stored)
        and stored.get("name") == "Ada Lovelace"
        and str(stored.get("age")) == "30"
        and stored.get("city") == "Lisbon",
        str(stored)[:140],
    )

    await page.reload(wait_until="domcontentloaded")
    await hydrated(page)
    await page.wait_for_timeout(1200)
    name = await read_field(page, "Name")
    city = await read_field(page, "City")
    record(
        "profile: values survive a reload",
        name == "Ada Lovelace" and city == "Lisbon",
        f"name={name!r} city={city!r}",
    )
    await shot(page, "1_profile")
    await ctx.close()


# --------------------------------------------------------------------------
# B. invite codes


async def check_invite_validation(browser):
    ctx = await browser.new_context(viewport=DESKTOP)
    page = await ctx.new_page()
    await page.goto(f"{BASE}/auth?mode=signup", wait_until="domcontentloaded")
    await hydrated(page)

    # Empty code: must not advance to the provider step.
    await page.get_by_role("button", name="Continue", exact=True).click()
    await page.wait_for_timeout(500)
    still_invite = await page.get_by_role("button", name="Continue with Google").count() == 0
    body = await body_text(page)
    record(
        "invite: empty code does not advance",
        still_invite and "Enter your invite code" in body,
        body[:120],
    )

    # Invalid code: rejected with a message.
    await page.locator("input[type=text]").first.fill("TOTALLY-BOGUS")
    await page.get_by_role("button", name="Continue", exact=True).click()
    await page.wait_for_timeout(600)
    body = await body_text(page)
    record("invite: invalid code is rejected", "isn't valid" in body, body[:120])

    # Whitespace + lowercase tolerance.
    await page.locator("input[type=text]").first.fill("  friends  ")
    await page.get_by_role("button", name="Continue", exact=True).click()
    await page.wait_for_timeout(800)
    advanced = await page.get_by_role("button", name="Continue with Google").count() > 0
    record("invite: lowercase / padded code still validates", advanced, page.url)
    await shot(page, "2_invite")

    if advanced:
        await page.get_by_role("button", name="Continue with Google").click()
        await page.wait_for_url(lambda u: "/auth" not in u, timeout=15000)

        # Sign out through the app's own control, then retry the same code.
        await page.goto(f"{BASE}/me", wait_until="domcontentloaded")
        await page.wait_for_timeout(1000)
        await page.get_by_text("Sign out", exact=True).first.click()
        await page.wait_for_timeout(1200)

        await page.goto(f"{BASE}/auth?mode=signup", wait_until="domcontentloaded")
        await hydrated(page)
        await page.locator("input[type=text]").first.fill("FRIENDS")
        await page.get_by_role("button", name="Continue", exact=True).click()
        await page.wait_for_timeout(800)
        body = await body_text(page)
        reused = await page.get_by_role("button", name="Continue with Google").count() == 0
        record(
            "invite: a consumed code cannot be used twice",
            reused and "already been used" in body,
            body[:140],
        )
        await shot(page, "3_invite_reuse")
    await ctx.close()


# --------------------------------------------------------------------------
# C. session detail


async def check_session_detail(browser):
    ctx = await browser.new_context(viewport=DESKTOP)
    page = await ctx.new_page()
    await page.goto(BASE, wait_until="domcontentloaded")
    await register(page, "WELCOME")

    wish = "A tennis partner for weekday mornings, easy pace."
    await page.goto(BASE, wait_until="domcontentloaded")
    await submit_wish(page, wish)
    try:
        await page.wait_for_url(
            lambda u: "/matchmaker" in u or "/side-by-side" in u, timeout=15000
        )
    except Exception:
        pass
    await page.wait_for_timeout(1500)

    await page.goto(f"{BASE}/sessions", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    rows = page.locator("main li")
    row_texts = await dom_texts(page, "main li")
    count = len(row_texts)
    row_text = row_texts[0] if count else ""
    record(
        "sessions: one submit == exactly one row carrying the wish",
        count == 1 and "tennis partner" in row_text,
        f"count={count} text={row_text[:80]!r}",
    )
    await shot(page, "4_sessions")

    if count:
        await rows.first.click()
        try:
            await page.wait_for_url(lambda u: "session=" in u, timeout=15000)
        except Exception:
            pass
        opened = ("/matchmaker" in page.url or "/side-by-side" in page.url) and "session=" in page.url
        record("sessions: row opens the workspace with ?session=", opened, page.url)

        await page.wait_for_timeout(2500)
        convo = await dom_text(page, "[data-testid='agent-messages']")
        record(
            "session detail: the original wish is restored in the agent thread",
            "tennis partner" in convo,
            convo[:120],
        )
        await shot(page, "5_session_detail")

        await page.goto(f"{BASE}/sessions", wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        again = await dom_count(page, "main li")
        record(
            "session detail: reopening does not create a duplicate session",
            again == 1,
            f"count={again}",
        )
    await ctx.close()


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        await check_profile_editing(browser)
        await check_invite_validation(browser)
        await check_session_detail(browser)
        await browser.close()

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    sys.exit(1 if failed else 0)


asyncio.run(main())
