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
        context = browser.new_context(
            viewport={"width": 1440, "height": 900}, locale="zh-CN", accept_downloads=True
        )
        page = context.new_page()
        try:
            page.goto(BASE + "/app/")
            expect(page.get_by_role("heading", name="实验工作台")).to_be_visible()
            expect(page.get_by_role("heading", name="脉宽分布")).to_be_visible()
            expect(page.get_by_role("heading", name="回旋管炮次数量分布")).to_be_visible()
            expect(page.get_by_role("heading", name="实验时间趋势")).to_be_visible()
            assert page.get_by_text("最近录入的炮次").count() == 0
            page.screenshot(path=str(out / "v11-dashboard.png"), full_page=True)

            # The dashboard/header must not show the create action.
            expect(page.get_by_role("link", name="新增炮次")).to_have_count(0)
            page.get_by_role("link", name="炮次记录").first.click()
            page.get_by_role("link", name="+ 新增炮次").click()
            expect(page.get_by_role("heading", name="新增炮次记录")).to_be_visible()
            page.get_by_placeholder("例如：GYRO-001").fill(SERIAL)
            # The shot suggestion is async; user may choose a custom BIGINT.
            page.get_by_placeholder("请输入整数炮号").fill(SHOT)
            # An in-flight auto-suggestion must not overwrite manually entered digits.
            page.wait_for_timeout(350)
            expect(page.get_by_placeholder("请输入整数炮号")).to_have_value(SHOT)
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

            # Filter custom values with multiple AND conditions across the full result.
            page.get_by_role("button", name="高级筛选").click()
            page.get_by_role("button", name="+ 添加条件").click()
            page.get_by_label("条件1参数名称").fill("custom_test")
            page.get_by_label("条件1值类型").select_option("DECIMAL")
            page.get_by_label("条件1比较方式").select_option("gt")
            page.get_by_label("条件1参数值").fill("2")
            page.get_by_role("button", name="+ 添加条件").click()
            page.get_by_label("条件2参数名称").fill("custom_test")
            page.get_by_label("条件2值类型").select_option("DECIMAL")
            page.get_by_label("条件2比较方式").select_option("lt")
            page.get_by_label("条件2参数值").fill("4")
            expect(page.get_by_text(SHOT, exact=True)).to_be_visible()
            page.get_by_role("button", name="清空筛选").click()
            # Inline editing was removed; Enter on a selected cell opens full edit.
            expect(page.get_by_role("button", name="编辑本行")).to_have_count(0)
            expect(page.get_by_role("link", name="完整编辑").first).to_be_visible()
            row = page.locator("tr[data-shot-id]").first
            row.locator("td").nth(2).click()
            page.locator(".v11-table-viewport").press("ArrowRight")
            expect(row.locator("td").nth(3)).to_have_class("v11-active-cell")
            page.locator(".v11-table-viewport").press("Enter")
            expect(page.get_by_role("heading", name="编辑炮次记录")).to_be_visible()
            expect(page.get_by_placeholder("参数值")).to_have_value("3.25")
            page.get_by_placeholder("参数值").fill("4.5")
            assert page.get_by_placeholder("例如：GYRO-001").is_disabled()
            assert page.get_by_placeholder("请输入整数炮号").is_disabled()
            page.get_by_role("button", name="保存并返回列表").click()
            expect(page.get_by_role("heading", name="炮次记录", exact=True)).to_be_visible()
            expect(page.get_by_role("button", name="编辑本行")).to_have_count(0)
            page.get_by_role("link", name="完整编辑").first.click()
            expect(page.get_by_placeholder("参数值")).to_have_value("4.5")
            page.get_by_role("button", name="保存并返回列表").click()
            expect(page.get_by_role("heading", name="炮次记录", exact=True)).to_be_visible()

            with page.expect_download() as download_info:
                page.get_by_role("link", name="导出 Excel").click()
            assert download_info.value.suggested_filename.endswith(".xlsx")
            with page.expect_download() as download_info:
                page.get_by_role("link", name="导出 CSV ZIP").click()
            assert download_info.value.suggested_filename.endswith(".zip")

            # Create a second pulse via the API for a reliable size comparison.
            response = page.request.post(
                BASE + "/api/v1/shots",
                data={
                    "Serial": SERIAL,
                    "shot": str(int(SHOT) + 1),
                    "date": "2026-10-15",
                    "iplen": "1000",
                    "custom_parameters": [],
                },
            )
            assert response.status == 201, response.text()

            page.goto(BASE + "/app/")
            expect(page.get_by_role("heading", name="实验工作台")).to_be_visible()
            expect(page.get_by_role("img", name="脉宽分布气泡云图")).to_be_visible()
            expect(page.get_by_text("脉宽 (s)")).to_be_visible()
            # Keep the dashboard visually concise.
            assert page.get_by_text("PULSE DISTRIBUTION").count() == 0
            assert page.get_by_text("点击气泡查看炮次详情").count() == 0
            assert page.get_by_text("回旋管运行参数 · 历史数据分析").count() == 0
            assert page.get_by_text("对数坐标").count() == 0
            longer = page.get_by_role(
                "button", name=SERIAL + " 第" + SHOT + "炮，脉宽 900000.0000000000ms"
            )
            shorter = page.get_by_role(
                "button", name=SERIAL + " 第" + str(int(SHOT) + 1) + "炮，脉宽 1000.0000000000ms"
            )
            assert float(longer.get_attribute("r")) > float(shorter.get_attribute("r"))
            assert float(longer.get_attribute("cx")) > float(shorter.get_attribute("cx"))
            # A positive pulse with only one point sits at the upper bound of a 0..max linear scale.
            cx = page.get_by_role(
                "button", name="V11-CHROMIUM-TEST-01 第" + SHOT + "炮，脉宽 900000.0000000000ms"
            ).get_attribute("cx")
            assert float(cx) == 940
            page.get_by_role(
                "button", name="V11-CHROMIUM-TEST-01 第" + SHOT + "炮，脉宽 900000.0000000000ms"
            ).click()
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
