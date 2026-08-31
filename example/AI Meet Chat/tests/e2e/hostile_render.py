"""Render-side hostile-payload coverage for Maitri (Playwright, Chromium).

The unit contract tests (tests/unit/ports-contract.test.ts) prove the stores
round-trip hostile input byte-for-byte. This file proves the other half:
when that same input reaches the DOM, the page never crashes and the text is
escaped — rendered as literal characters, never as markup or script.

Groups:
  A. profile        — hostile name/city/occupation/moments/favorites on /profile, /me
  B. saved people   — hostile sessionId next to a real person, in the Saved drawer
  C. intents        — a hostile wish typed through the real home composer

Read-only: no app source, selector, or copy is changed by this test.

Run:  python3 tests/e2e/hostile_render.py
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

# Payloads that try to break out of text into markup, script or JSON.
XSS_IMG = '<img src=x onerror="window.__xss=1">'
XSS_SCRIPT = '</script><script>window.__xss=1</script>'
XSS_SVG = '<svg onload="window.__xss=1"></svg>'
JSON_BREAK = '"}]},[{"injected":true}'
WEIRD = 'ctrl\u0000\u000b zero\u200bwidth 中文 🎾 <b>bold?</b>'

results = []


def record(name, ok, note=""):
    results.append((name, ok, note))
    print(("PASS " if ok else "FAIL ") + name + ((" :: " + note) if note else ""))


async def shot(page, name):
    try:
        await page.screenshot(path=str(SHOTS / f"hostile_{name}.png"), timeout=10000)
    except Exception:
        pass


async def hydrated(page):
    await page.wait_for_selector("input[type=text], textarea", timeout=15000)
    await page.wait_for_timeout(1200)


async def body_text(page):
    return await page.evaluate(
        "() => (document.body.innerText || '') + '\\n' + (document.body.textContent || '')"
    )






async def register(page, code="WELCOME"):
    """Walk the real signup UI: invite step -> provider step. Polls the URL
    instead of waiting on a single navigation event, which flakes under HMR."""
    await page.goto(f"{BASE}/auth?mode=signup", wait_until="domcontentloaded")
    await hydrated(page)
    # Type key by key: the invite field is a controlled input that normalises
    # each keystroke, and a bulk fill() can land before React has attached.
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



# The three signals that matter on every hostile page:
#   1. nothing executed  -> window.__xss stays undefined
#   2. nothing parsed as markup -> no injected element landed in the document
#   3. the page still rendered -> a real app root with content, no blank screen
INJECTION_PROBE_JS = """
() => ({
  executed: window.__xss !== undefined,
  injected: document.querySelectorAll(
    'img[src="x"], svg[onload], script:not([src]):not([type])'
  ).length,
  scriptText: [...document.querySelectorAll('script:not([src])')]
      .some((s) => (s.textContent || '').includes('window.__xss')),
  bodyChars: (document.body.innerText || '').trim().length,
})
"""


async def probe(page):
    return await page.evaluate(INJECTION_PROBE_JS)


async def assert_safe(page, label, must_contain=()):
    """One page, three assertions: no execution, no markup, still rendered."""
    p = await probe(page)
    record(
        f"{label}: hostile payload is not executed or parsed as markup",
        not p["executed"] and p["injected"] == 0 and not p["scriptText"],
        str(p),
    )
    record(
        f"{label}: page still renders (no blank screen / crash)",
        p["bodyChars"] > 40,
        f"bodyChars={p['bodyChars']}",
    )
    if must_contain:
        body = await body_text(page)
        missing = [s for s in must_contain if s not in body]
        record(
            f"{label}: hostile text is shown verbatim as escaped text",
            not missing,
            f"missing={[m[:40] for m in missing]}",
        )


# --------------------------------------------------------------------------
# A. profile


HOSTILE_PROFILE = {
    "avatar": "",
    "name": XSS_IMG,
    "age": 30,
    "city": XSS_SCRIPT,
    "occupation": XSS_SVG,
    "gender": "",
    "orientation": "",
    "mbti": JSON_BREAK,
    "moments": [{"id": "m1", "promptId": "saturday", "answer": XSS_IMG + " " + WEIRD}],
    "favorites": [{"kind": "book", "title": XSS_SCRIPT, "why": JSON_BREAK}],
    "hidden": [],
}


async def check_profile(browser):
    ctx = await browser.new_context(viewport=DESKTOP)
    page = await ctx.new_page()
    await page.goto(BASE, wait_until="domcontentloaded")
    await register(page)
    await page.evaluate(
        "p => localStorage.setItem('kindred:profile.v1', JSON.stringify(p))", HOSTILE_PROFILE
    )

    await page.goto(f"{BASE}/profile", wait_until="domcontentloaded")
    await hydrated(page)
    await page.wait_for_timeout(1200)
    # The profile form holds these values in inputs, not text nodes, so the
    # verbatim check happens on input values just below.
    await assert_safe(page, "profile page")

    await shot(page, "1_profile")

    # The same values, read back through the form inputs, must be unchanged.
    values = await page.evaluate(
        "() => [...document.querySelectorAll('main input')].map((i) => i.value)"
    )
    record(
        "profile page: form inputs hold the payload unmodified",
        XSS_IMG in values and XSS_SCRIPT in values,
        str(values)[:160],
    )

    await page.goto(f"{BASE}/me", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    await assert_safe(page, "me hub")
    await shot(page, "2_me")

    # Home renders the account entry from the same profile record.
    await page.goto(BASE, wait_until="domcontentloaded")
    await hydrated(page)
    await assert_safe(page, "home with hostile profile")
    await ctx.close()


# --------------------------------------------------------------------------
# B. saved people


async def check_saved_people(browser):
    ctx = await browser.new_context(viewport=DESKTOP)
    page = await ctx.new_page()
    await page.goto(BASE, wait_until="domcontentloaded")
    await register(page)
    # A real seed person (so the record survives the directory filter) carrying
    # a hostile sessionId, plus a poisoned neighbour row.
    await page.evaluate(
        """() => localStorage.setItem('kindred:saved-people:v1', JSON.stringify([
          { personId: 'isa', sessionId: '</script><script>window.__xss=1</script>', savedAt: Date.now() },
          { personId: '<img src=x onerror="window.__xss=1">', sessionId: 's2', savedAt: Date.now() }
        ]))"""
    )
    await page.goto(BASE, wait_until="domcontentloaded")
    await hydrated(page)
    await assert_safe(page, "home with hostile saved rows")

    saved = page.get_by_role("button", name="Saved")
    if await saved.count():
        await saved.first.click()
        await page.wait_for_timeout(1500)
        await assert_safe(page, "saved drawer")
        await shot(page, "3_saved")
    else:
        record("saved drawer: entry is reachable", False, "no Saved trigger rendered")

    # A blob that is not even an array must not wedge the page.
    await page.evaluate(
        "() => localStorage.setItem('kindred:saved-people:v1', '{\"not\":\"an array\"}')"
    )
    await page.goto(BASE, wait_until="domcontentloaded")
    await hydrated(page)
    await assert_safe(page, "home with a poisoned saved blob")
    await ctx.close()


# --------------------------------------------------------------------------
# C. intents — typed through the real composer, so the payload travels the
# whole publish -> match -> render path rather than being injected at rest.


async def check_intent(browser):
    ctx = await browser.new_context(viewport=DESKTOP)
    page = await ctx.new_page()
    await page.goto(BASE, wait_until="domcontentloaded")
    await register(page)
    await page.evaluate(
        "p => localStorage.setItem('kindred:profile.v1', JSON.stringify(p))",
        {
            "avatar": "",
            "name": "Ada",
            "age": 30,
            "city": "Lisbon",
            "occupation": "Translator",
            "gender": "",
            "orientation": "",
            "mbti": "",
            "moments": [],
            "favorites": [],
            "hidden": [],
        },
    )

    wish = f"A tennis partner for weekend mornings {XSS_IMG} {JSON_BREAK} {WEIRD}"
    await page.goto(BASE, wait_until="domcontentloaded")
    await hydrated(page)
    ta = page.locator("textarea").first
    await ta.click()
    await ta.fill(wish)
    await ta.press("Enter")
    try:
        await page.wait_for_url(
            lambda u: "/matchmaker" in u or "/side-by-side" in u, timeout=15000
        )
    except Exception:
        pass
    await page.wait_for_timeout(3000)
    await assert_safe(page, "wish workspace", must_contain=(XSS_IMG,))
    await shot(page, "4_workspace")

    await page.goto(f"{BASE}/sessions", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    await assert_safe(page, "sessions list", must_contain=(XSS_IMG,))
    await shot(page, "5_sessions")

    # Reload the workspace from storage: the payload now comes back out of the
    # persisted session/intent records rather than from live state.
    await page.go_back(wait_until="domcontentloaded")
    await page.wait_for_timeout(2500)
    await assert_safe(page, "wish workspace after reload")
    await ctx.close()


# --------------------------------------------------------------------------
# D. every surface — one hostile account (profile + saved people + a published
# wish) walked across every route and every drawer that renders that text, on
# desktop and on an iPhone viewport. The bar is the same everywhere: no
# execution, no parsed markup, no blank screen.

IPHONE = {"width": 390, "height": 844, "is_mobile": True, "has_touch": True}

ROUTES = ["/", "/profile", "/me", "/sessions", "/connections", "/privacy", "/terms"]


async def seed_hostile_account(page, code="WELCOME"):
    """One account carrying hostile text in all three stores."""
    await page.goto(BASE, wait_until="domcontentloaded")
    await register(page, code)
    await page.evaluate(
        "p => localStorage.setItem('kindred:profile.v1', JSON.stringify(p))",
        {**HOSTILE_PROFILE, "city": "Lisbon"},  # real city so matching can run
    )
    await page.evaluate(
        """(payload) => localStorage.setItem('kindred:saved-people:v1', JSON.stringify([
          { personId: 'isa', sessionId: payload, savedAt: Date.now() }
        ]))""",
        XSS_SCRIPT,
    )
    # A hostile wish published through the real composer, so /sessions,
    # /matchmaker and the History drawer all have hostile rows to render.
    await page.goto(BASE, wait_until="domcontentloaded")
    await hydrated(page)
    ta = page.locator("textarea").first
    await ta.click()
    await ta.fill(f"A tennis partner on weekend mornings {XSS_IMG} {JSON_BREAK} {WEIRD}")
    await ta.press("Enter")
    try:
        await page.wait_for_url(
            lambda u: "/matchmaker" in u or "/side-by-side" in u, timeout=15000
        )
    except Exception:
        pass
    await page.wait_for_timeout(3000)
    return page.url


async def sweep_routes(page, label, workspace_url):
    """Visit every content route plus the live workspace and assert safety."""
    for route in ROUTES + ["/matchmaker", "/side-by-side"]:
        await page.goto(f"{BASE}{route}", wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        await assert_safe(page, f"{label} {route}")
    if workspace_url:
        await page.goto(workspace_url, wait_until="domcontentloaded")
        await page.wait_for_timeout(2500)
        await assert_safe(page, f"{label} workspace (restored session)")


async def open_drawer(page, name):
    """Click a header/hub entry by accessible name; report if unreachable."""
    trigger = page.get_by_role("button", name=name)
    if await trigger.count() == 0:
        trigger = page.get_by_text(name, exact=True)
    if await trigger.count() == 0:
        record(f"{name} drawer: entry is reachable", False, "no trigger rendered")
        return False
    await trigger.first.click()
    await page.wait_for_timeout(1500)
    return True


async def check_all_surfaces(browser):
    # --- desktop: routes, header drawers, public profile sheet -------------
    ctx = await browser.new_context(viewport=DESKTOP)
    page = await ctx.new_page()
    workspace_url = await seed_hostile_account(page)
    await sweep_routes(page, "desktop", workspace_url)

    await page.goto(BASE, wait_until="domcontentloaded")
    await hydrated(page)
    for entry in ("History", "Saved"):
        if await open_drawer(page, entry):
            await assert_safe(page, f"desktop {entry} drawer")
            await shot(page, f"6_{entry.lower()}_drawer")
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(500)

    # The account menu renders the hostile display name.
    if await open_drawer(page, "Account"):
        await assert_safe(page, "desktop account menu")

    # The public profile sheet, reached the way a user reaches it: an
    # introduction wish, then the avatar on the person card.
    await page.goto(BASE, wait_until="domcontentloaded")
    await hydrated(page)
    ta = page.locator("textarea").first
    await ta.click()
    await ta.fill("Someone who reads on rainy evenings and walks home the long way.")
    await ta.press("Enter")
    try:
        await page.wait_for_url(lambda u: "/matchmaker" in u, timeout=15000)
    except Exception:
        pass
    await page.wait_for_timeout(3500)
    await assert_safe(page, "introduction result with hostile profile")
    avatar = page.locator("img[alt]").first
    if await avatar.count():
        try:
            await avatar.click(timeout=5000)
            await page.wait_for_timeout(1500)
            await assert_safe(page, "public profile sheet")
            await shot(page, "7_public_profile")
        except Exception as exc:
            record("public profile sheet: avatar opens the sheet", False, str(exc)[:80])
    else:
        record("public profile sheet: avatar is reachable", False, "no avatar rendered")

    await ctx.close()

    # --- iPhone: same stores, mobile shells (tab bar, Me hub, chats) -------
    ctx = await browser.new_context(viewport={"width": 390, "height": 844},
                                    is_mobile=True, has_touch=True)
    page = await ctx.new_page()
    workspace_url = await seed_hostile_account(page, "FRIENDS")
    await sweep_routes(page, "mobile", workspace_url)

    await page.goto(f"{BASE}/me", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    await assert_safe(page, "mobile me hub with hostile profile")
    if await open_drawer(page, "Saved"):
        await assert_safe(page, "mobile Saved drawer")
        await shot(page, "8_mobile_saved")
    await ctx.close()


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        await check_profile(browser)
        await check_saved_people(browser)
        await check_intent(browser)
        await check_all_surfaces(browser)
        await browser.close()


    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    sys.exit(1 if failed else 0)


asyncio.run(main())
