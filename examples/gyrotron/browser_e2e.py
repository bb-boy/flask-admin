"""Chromium smoke test for the retained legacy Flask-Admin form."""
from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

BASE_URL = os.getenv("TEST_BASE_URL", "http://127.0.0.1:8000")


def main():
    artifacts = Path("artifacts")
    artifacts.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        try:
            page.goto(BASE_URL + "/admin/shots/new/")
            expect(page.locator('input[name="Serial"]')).to_be_visible()
            page.locator('input[name="Serial"]').fill("BROWSER-E2E-001")
            page.locator('input[name="shot"]').fill("501")
            # Flask-Admin datepicker overlays buttons if typed interactively.
            # Set its value without opening the calendar; React UI covers normal date input.
            page.locator('input[name="date"]').evaluate(
                "(node) => { node.value = '2026-10-15'; "
                "node.dispatchEvent(new Event('change', {bubbles:true})); }"
            )
            page.locator("#custom_parameters-button").click()
            expect(page.locator('[name="custom_parameters-0-name"]')).to_be_visible()
            page.locator('[name="custom_parameters-0-name"]').fill("It")
            page.locator('[name="custom_parameters-0-description"]').fill("钛泵电流")
            page.locator('[name="custom_parameters-0-unit"]').fill("mA")
            page.locator('[name="custom_parameters-0-value"]').fill("2.5")
            page.locator('input[type="submit"]').first.click()
            page.wait_for_url("**/admin/shots/**")
            expect(page.get_by_text("BROWSER-E2E-001")).to_be_visible()

            with urlopen(BASE_URL + "/api/v1/shots?search=" + quote("BROWSER-E2E-001")) as resp:
                ids = [item["id"] for item in json.load(resp)["items"]]
            assert ids, "Legacy form did not save a shot"
            shot_id = ids[0]

            page.goto(BASE_URL + "/admin/shots/new/")
            assert page.locator('[name="custom_parameters-0-name"]').count() == 0

            edit_url = BASE_URL + "/admin/shots/edit/?id=" + str(shot_id)
            page.goto(edit_url)
            expect(page.locator('[name="custom_parameters-0-name"]')).to_have_value("It")
            page.locator('[name="custom_parameters-0-value"]').fill("3.75")
            page.locator('input[type="submit"]').first.click()
            page.goto(edit_url)
            expect(page.locator('[name="custom_parameters-0-value"]')).to_have_value("3.75")
            page.screenshot(path=str(artifacts / "gyrotron-edit.png"), full_page=True)
            print("Legacy Chromium: create, independent parameters, history edit PASS")
        except Exception:
            page.screenshot(path=str(artifacts / "gyrotron-failure.png"), full_page=True)
            raise
        finally:
            browser.close()


if __name__ == "__main__":
    main()
