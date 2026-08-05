"""End-to-end tests for the AI conversation surface (Web).

Verifies the critical path from entering an Agent workspace to getting a
match / sending a message:

  A. Introduce Someone (matchmaker)
     1. a wish typed on the home composer opens the workspace and is
        replayed as the first user turn
     2. the Agent answers (assistant bubble appears, thinking clears)
     3. a follow-up message typed in the workspace gets another answer
     4. suggestion chips pre-fill the composer and can be sent
     5. the right pane (canvas) renders a result

  B. Do Something Together (side-by-side)
     1. an activity wish routes to /side-by-side and gets published
     2. the canvas reaches a match or an explicit no-match state
     3. on a match, "Start chatting" opens the thread and a sent message
        shows up in it

Run:  python3 tests/e2e/agent_chat.py
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
    await page.locator("input[type=text]").first.fill(code)
    await page.get_by_role("button", name="Continue", exact=True).click()
    await page.get_by_role("button", name="Continue with Google").click()
    await page.wait_for_url(lambda u: "/auth" not in u, timeout=15000)


async def seed_profile(page):
    profile = {
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
    }
    await page.evaluate(
        "p => localStorage.setItem('kindred:profile.v1', JSON.stringify(p))", profile
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
    """The workspace Agent composer (not the home one)."""
    el = page.get_by_test_id("agent-composer")
    await el.wait_for(state="visible", timeout=15000)
    return el


async def send_in_workspace(page, text):
    el = await composer(page)
    await el.click()
    await el.fill(text)
    await el.press("Enter")


async def wait_for_assistant(page, at_least, timeout=15000):
    """Wait until there are >= `at_least` assistant bubbles and no spinner."""
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


async def counts(page):
    u = await page.get_by_test_id("agent-msg-user").count()
    a = await page.get_by_test_id("agent-msg-assistant").count()
    return u, a


# --------------------------------------------------------------------------


async def flow_matchmaker_chat(context):
    page = await context.new_page()
    await page.goto(BASE, wait_until="domcontentloaded")
    await register(page, "WELCOME")
    await seed_profile(page)

    await submit_wish(
        page, "Someone who reads on rainy evenings and walks home the long way."
    )
    record("matchmaker: home wish opens the Agent workspace", "/matchmaker" in page.url, page.url)

    ok = await wait_for_assistant(page, 1)
    u, a = await counts(page)
    record("matchmaker: seeded wish becomes the first user turn", u >= 1, f"user={u}")
    record("matchmaker: Agent answers the first turn", ok and a >= 1, f"assistant={a}")
    await shot(page, "a1_matchmaker_first_turn")

    # Follow-up turn inside the workspace.
    before_u, before_a = u, a
    await send_in_workspace(page, "She should care about kindness more than status.")
    ok = await wait_for_assistant(page, before_a + 1)
    u, a = await counts(page)
    record(
        "matchmaker: follow-up message is answered",
        ok and u > before_u and a > before_a,
        f"user={u} assistant={a}",
    )
    await shot(page, "a2_matchmaker_followup")

    # Suggestion chip pre-fills the composer.
    chips = page.get_by_test_id("agent-suggestion")
    if await chips.count() > 0:
        label = (await chips.first.inner_text()).strip()
        await chips.first.click()
        await page.wait_for_timeout(300)
        el = await composer(page)
        value = await el.input_value()
        record("matchmaker: suggestion chip pre-fills the composer", value.strip() == label, value[:60])
        before_a = a
        await el.press("Enter")
        ok = await wait_for_assistant(page, before_a + 1)
        record("matchmaker: chip-sent message is answered", ok)
    else:
        record("matchmaker: suggestion chip pre-fills the composer", False, "no chips rendered")

    # The right pane must render something (a person card or a prompt).
    canvas = page.get_by_test_id("agent-canvas")
    canvas_text = (await canvas.inner_text()) if await canvas.count() else ""
    record("matchmaker: result pane renders content", len(canvas_text.strip()) > 0, canvas_text[:80])
    await shot(page, "a3_matchmaker_canvas")
    await page.close()


async def flow_side_by_side_chat(context):
    page = await context.new_page()
    await page.goto(BASE, wait_until="domcontentloaded")
    await register(page, "FRIENDS")
    await seed_profile(page)

    await submit_wish(page, "Saturday morning tennis in Shanghai, casual level.")
    record(
        "side-by-side: activity wish routes to the together Agent",
        "/side-by-side" in page.url,
        page.url,
    )

    ok = await wait_for_assistant(page, 1)
    u, a = await counts(page)
    record("side-by-side: wish is replayed as the first user turn", u >= 1, f"user={u}")
    record("side-by-side: Agent answers the publish turn", ok and a >= 1, f"assistant={a}")
    await shot(page, "b1_side_first_turn")

    # Resolve any inline ask (when / level) so the wish can publish.
    for _ in range(3):
        ask_buttons = page.locator("[data-testid='agent-messages'] button")
        locked = await page.get_by_test_id("agent-composer").is_disabled()
        if not locked:
            break
        if await ask_buttons.count() == 0:
            break
        await ask_buttons.first.click()
        await page.wait_for_timeout(900)

    await page.wait_for_timeout(1500)
    canvas = page.get_by_test_id("agent-canvas")
    canvas_text = (await canvas.inner_text()) if await canvas.count() else ""
    settled = any(
        k in canvas_text
        for k in ["Start chatting", "See next", "published", "Nobody", "why matched"]
    )
    record(
        "side-by-side: canvas reaches a match or explicit no-match state",
        settled,
        canvas_text[:100].replace("\n", " | "),
    )
    await shot(page, "b2_side_canvas")

    start = page.get_by_role("button", name="Start chatting")
    if await start.count() > 0:
        await start.first.click()
        await page.wait_for_timeout(1200)
        thread_input = page.get_by_placeholder("Say something…")
        opened = await thread_input.count() > 0
        record("side-by-side: match opens the chat thread", opened)
        if opened:
            await thread_input.first.click()
            await thread_input.first.fill("Saturday 9am at the courts works for me.")
            await thread_input.first.press("Enter")
            await page.wait_for_timeout(1000)
            body = await canvas.inner_text()
            record(
                "side-by-side: sent message appears in the thread",
                "Saturday 9am at the courts" in body,
                body[-120:].replace("\n", " | "),
            )
        await shot(page, "b3_side_thread")
    else:
        # No match in the pool is a valid product state, but the wish must
        # still be live with a recovery action on screen.
        record(
            "side-by-side: no-match state offers a next step",
            any(k in canvas_text for k in ["See next", "Take it back", "Nobody", "swap"]),
            canvas_text[:100].replace("\n", " | "),
        )
    await page.close()


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)

        ctx = await browser.new_context(viewport=DESKTOP)
        await flow_matchmaker_chat(ctx)
        await ctx.close()

        ctx = await browser.new_context(viewport=DESKTOP)
        await flow_side_by_side_chat(ctx)
        await ctx.close()

        await browser.close()

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    sys.exit(1 if failed else 0)


asyncio.run(main())
