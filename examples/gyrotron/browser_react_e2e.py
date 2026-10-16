"""Chromium regression for V1.1, running only against a local test database."""
from __future__ import annotations

import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

BASE = os.getenv("TEST_BASE_URL", "http://127.0.0.1:8000")
SERIAL = "V11-CHROMIUM-TEST-01"
SHOT = "735000000001"


def main():
    out = Path("artifacts")
    out.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900},
                                      locale="zh-CN", accept_downloads=True)
        page = context.new_page()
        try:
            page.goto(BASE + "/app/")
            expect(page.get_by_role("heading", name="实验工作台")).to_be_visible()
            expect(page.get_by_role("heading", name="脉宽分布")).to_be_visible()
            expect(page.get_by_role("heading", name="回旋管炮次数量分布")).to_be_visible()
            expect(page.get_by_role("heading", name="实验时间趋势")).to_be_visible()
            assert page.get_by_text("最近录入的炮次").count() == 0
            page.screenshot(path=str(out / "v11-dashboard.png"), full_page=True)

            page.get_by_role("link", name="新增炮次").first.click()
            expect(page.get_by_role("heading", name="新增炮次记录")).to_be_visible()
            page.get_by_placeholder("例如：GYRO-001").fill(SERIAL)
            # The shot suggestion is async; user may choose a custom BIGINT.
            page.get_by_placeholder("请输入整数炮号").fill(SHOT)
            page.get_by_placeholder("请输入测量值").first.fill("900000")
            page.get_by_role("button", name="添加自定义参数").click()
            page.get_by_placeholder("例如：It").fill("custom_test")
            # Parameter meaning + unit may be omitted.
            page.get_by_placeholder("参数值").fill("3.25")
            page.screenshot(path=str(out / "v11-new.png"), full_page=True)
            page.get_by_role("button", name="保存并录入下一炮").click()
            expect(page.get_by_placeholder("例如：GYRO-001")).to_have_value(SERIAL)
            expect(page.get_by_placeholder("请输入整数炮号")).to_have_value(str(int(SHOT) + 1))
            expect(page.get_by_placeholder("请输入测量值").first).to_have_value("")
            assert page.get_by_placeholder("例如：It").count() == 0
            page.goto(BASE + "/app/records?serial=" + SERIAL)
            expect(page.get_by_role("heading", name="炮次记录", exact=True)).to_be_visible()
            expect(page.get_by_text(SHOT, exact=True)).to_be_visible()
            page.screenshot(path=str(out / "v11-records.png"), full_page=True)

            page.get_by_role("button", name="编辑本行").first.click()
            expect(page.get_by_text("编辑本行：" + SERIAL + " / " + SHOT)).to_be_visible()
            page.locator(".v11-inline input").last.fill("4.5")
            page.get_by_role("button", name="保存本行").click()
            expect(page.get_by_text("编辑本行：" + SERIAL + " / " + SHOT)).to_have_count(0)
            page.get_by_role("link", name="完整编辑").first.click()
            expect(page.get_by_placeholder("参数值")).to_have_value("4.5")
            assert page.get_by_placeholder("例如：GYRO-001").is_disabled()
            assert page.get_by_placeholder("请输入整数炮号").is_disabled()
            page.get_by_role("button", name="保存并返回列表").click()
            expect(page.get_by_role("heading", name="炮次记录", exact=True)).to_be_visible()

            with page.expect_download() as download_info:
                page.get_by_role("link", name="导出 Excel").click()
            assert download_info.value.suggested_filename.endswith(".xlsx")
            with page.expect_download() as download_info:
                page.get_by_role("link", name="导出 CSV ZIP").click()
            assert download_info.value.suggested_filename.endswith(".zip")

            page.goto(BASE + "/app/")
            expect(page.get_by_role("heading", name="实验工作台")).to_be_visible()
            expect(page.get_by_role("img", name="脉宽分布蜂群散点图")).to_be_visible()
            page.get_by_role("button", name="V11-CHROMIUM-TEST-01 第" + SHOT + "炮，脉宽 900000.0000000000ms").click()
            expect(page.get_by_role("complementary", name="炮次详情")).to_be_visible()
            page.get_by_role("button", name="关闭").click()

            page.set_viewport_size({"width": 390, "height": 844})
            page.goto(BASE + "/app/")
            expect(page.get_by_role("heading", name="实验工作台")).to_be_visible()
            page.screenshot(path=str(out / "v11-mobile.png"), full_page=True)

            page.set_viewport_size({"width": 1440, "height": 900})
            page.goto(BASE + "/app/records?serial=" + SERIAL)
            page.once("dialog", lambda dialog: dialog.accept())
            page.get_by_role("button", name="删除全部筛选结果").click()
            expect(page.get_by_text(SHOT, exact=True)).to_have_count(0)
            print("V1.1 Chromium end-to-end: PASS")
        except Exception:
            page.screenshot(path=str(out / "v11-failure.png"), full_page=True)
            raise
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    main()
