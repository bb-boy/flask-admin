"""Real Chromium smoke test for inline parameter editing."""
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def main():
    artifacts = Path("artifacts")
    artifacts.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        try:
            page.goto("http://127.0.0.1:8000/admin/shots/new/")
            expect(page.locator('input[name="Serial"]')).to_be_visible()
            page.locator('input[name="Serial"]').fill("BROWSER-E2E-001")
            page.locator('input[name="shot"]').fill("501")
            page.locator("#custom_parameters-button").click()
            expect(page.locator('[name="custom_parameters-0-name"]')).to_be_visible()
            page.locator('[name="custom_parameters-0-name"]').fill("It")
            page.locator('[name="custom_parameters-0-description"]').fill("钛泵电流")
            page.locator('[name="custom_parameters-0-unit"]').fill("mA")
            page.locator('[name="custom_parameters-0-value"]').fill("2.5")
            page.locator('input[type="submit"]').first.click()
            page.wait_for_url("**/admin/shots/**")
            expect(page.get_by_text("BROWSER-E2E-001")).to_be_visible()

            # Fresh create page must not inherit the previous shot's parameter.
            page.goto("http://127.0.0.1:8000/admin/shots/new/")
            assert page.locator('[name="custom_parameters-0-name"]').count() == 0

            # Existing saved inline parameters should be rehydrated on edit.
            page.goto("http://127.0.0.1:8000/admin/shots/edit/?id=1")
            expect(page.locator('[name="custom_parameters-0-name"]')).to_have_value("It")
            page.locator('[name="custom_parameters-0-value"]').fill("3.75")
            page.locator('input[type="submit"]').first.click()
            page.goto("http://127.0.0.1:8000/admin/shots/edit/?id=1")
            expect(page.locator('[name="custom_parameters-0-value"]')).to_have_value("3.75")
            page.screenshot(path=str(artifacts / "gyrotron-edit.png"), full_page=True)
            print("Chromium: click Add, save, fresh form reset, history edit OK.")
        except Exception:
            page.screenshot(path=str(artifacts / "gyrotron-failure.png"), full_page=True)
            raise
        finally:
            browser.close()


if __name__ == "__main__":
    main()
