"""Actual Chromium UI test for the new React frontend and Flask API."""
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def main():
    path = Path("artifacts")
    path.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900}, locale="zh-CN")
        try:
            page.goto("http://127.0.0.1:8000/app/")
            expect(page.get_by_role("heading", name="实验数据总览")).to_be_visible()
            expect(page.get_by_text("累计炮次记录")).to_be_visible()
            page.screenshot(path=str(path / "react-dashboard.png"), full_page=True)

            page.get_by_role("link", name="录入新炮次").click()
            expect(page.get_by_role("heading", name="新增炮次记录")).to_be_visible()
            page.get_by_placeholder("例如：GYRO-001").fill("REACT-CHROMIUM-001")
            page.get_by_placeholder("请输入整数炮号").fill("10000000002")
            page.get_by_placeholder("请输入测量值").first.fill("1.5")
            page.get_by_role("button", name="添加自定义参数").click()
            page.get_by_placeholder("例如：It").fill("It")
            page.get_by_placeholder("例如：钛泵电流").fill("钛泵电流")
            page.get_by_placeholder("参数值").fill("2.50")
            page.screenshot(path=str(path / "react-new-shot.png"), full_page=True)
            page.get_by_role("button", name="保存炮次记录").click()
            expect(page.get_by_role("heading", name="炮次记录", exact=True)).to_be_visible()
            expect(page.get_by_text("REACT-CHROMIUM-001")).to_be_visible()

            page.get_by_role("link", name="编辑 REACT-CHROMIUM-001 第 10000000002 炮").click()
            expect(page.get_by_role("heading", name="编辑炮次记录")).to_be_visible()
            expect(page.get_by_placeholder("参数值")).to_have_value("2.50")
            page.get_by_placeholder("参数值").fill("3.75")
            page.get_by_role("button", name="保存炮次记录").click()
            page.get_by_role("link", name="编辑 REACT-CHROMIUM-001 第 10000000002 炮").click()
            expect(page.get_by_placeholder("参数值")).to_have_value("3.75")

            page.get_by_role("button", name="删除参数").click()
            page.get_by_role("button", name="保存炮次记录").click()
            page.get_by_role("link", name="编辑 REACT-CHROMIUM-001 第 10000000002 炮").click()
            expect(page.get_by_text("本炮次尚未设置自定义参数")).to_be_visible()
            page.screenshot(path=str(path / "react-edit-shot.png"), full_page=True)

            page.goto("http://127.0.0.1:8000/app/records/new")
            assert page.get_by_placeholder("例如：It").count() == 0

            page.set_viewport_size({"width": 390, "height": 844})
            page.goto("http://127.0.0.1:8000/app/")
            expect(page.get_by_role("heading", name="实验数据总览")).to_be_visible()
            page.get_by_role("button", name="打开菜单").click()
            expect(page.get_by_role("navigation", name="主导航")).to_be_visible()
            page.screenshot(path=str(path / "react-mobile.png"), full_page=True)

            # Remove the test shot using the actual confirmation dialog.
            page.set_viewport_size({"width": 1440, "height": 900})
            page.goto("http://127.0.0.1:8000/app/records")
            page.once("dialog", lambda dialog: dialog.accept())
            page.get_by_role("button", name="删除 REACT-CHROMIUM-001 第 10000000002 炮").click()
            expect(page.get_by_text("没有找到符合条件的炮次记录。")).to_be_visible()
            print("React Chromium: Chinese UI, new/edit/delete, independent params, mobile OK")
        except Exception:
            page.screenshot(path=str(path / "react-failure.png"), full_page=True)
            raise
        finally:
            browser.close()


if __name__ == "__main__":
    main()
