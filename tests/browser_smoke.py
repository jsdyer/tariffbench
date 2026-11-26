"""Exercise the built electricity calculator at a project subpath in Chromium."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import os
import shutil
import tempfile
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    screenshots = ROOT / "browser-checks"
    screenshots.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        shutil.copytree(ROOT / "dist", Path(temporary) / "tariffbench")
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=temporary))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as p:
                options = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}
                browser = p.chromium.launch(**options)
                page = browser.new_page(viewport={"width": 1280, "height": 1000}, accept_downloads=True)
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(f"http://127.0.0.1:{server.server_port}/tariffbench/")
                page.wait_for_selector('[data-plan="bc-tiered"]')
                assert page.locator('#added-kwh').inner_text() == '43.2'
                assert page.locator('#total-kwh').inner_text() == '643.2'
                assert page.locator('[data-plan="bc-tiered"] .plan-price strong').first.inner_text() == '$82.13'
                assert page.locator('[data-plan="bc-tiered"] .increment strong').inner_text() == '$5.05'
                assert page.evaluate('localStorage.length') == 0
                page.locator('#base-kwh').fill('650')
                assert page.locator('[data-plan="bc-tiered"] .increment strong').inner_text() == '$5.65'
                page.locator('#days').fill('')
                assert page.locator('#validation').is_visible()
                assert page.locator('#result-content').is_hidden()
                assert page.locator('#export-csv').is_disabled()
                page.locator('#days').fill('30')
                page.locator('#base-night').fill('90')
                page.locator('#base-peak').fill('20')
                assert page.locator('#validation').is_visible()
                page.locator('#region').select_option('ns')
                assert page.locator('#validation').is_hidden()
                assert page.locator('#months-field').is_visible()
                assert page.locator('#time-card').is_hidden()
                page.locator('#months').fill('2')
                assert page.locator('.plan').count() == 1
                page.locator('#add-device').click()
                page.locator('.device').last.locator('[data-key="name"]').fill('<img src=x onerror="alert(1)">')
                assert page.locator('img').count() == 0
                page.locator('#save').click()
                page.locator('#base-kwh').fill('1')
                page.locator('#restore').click()
                assert page.locator('#base-kwh').input_value() == '650'
                assert page.locator('.device').count() == 2
                with page.expect_download() as download:
                    page.locator('#export-json').click()
                scenario = json.loads(Path(download.value.path()).read_text())
                assert scenario['scenario']['months'] == 2
                assert scenario['scenario']['devices'][1]['name'].startswith('<img')
                scenario['scenario']['baseKwh'] = 777
                page.locator('#import-file').set_input_files({'name': 'scenario.json', 'mimeType': 'application/json', 'buffer': json.dumps(scenario).encode()})
                page.wait_for_function('document.querySelector("#base-kwh").value === "777"')
                with page.expect_download() as download:
                    page.locator('#export-csv').click()
                assert '2026-11-reviewed' in Path(download.value.path()).read_text()
                page.locator('#forget').click()
                assert page.evaluate('localStorage.length') == 0
                page.locator('#region').select_option('bc')
                page.locator('#base-night').fill('33.3333333333')
                page.locator('#base-peak').fill('20.8333333333')
                page.locator('#appliance-model option').first.wait_for()
                before=page.locator('#devices .device').count()
                page.locator('#appliance-query').fill('Whirlpool')
                page.locator('#add-appliance').click()
                assert page.locator('#devices .device').count()==before+1
                assert 'kWh/yr' in page.locator('#devices .device').last.locator('[data-key="name"]').input_value()
                page.screenshot(path=str(screenshots / 'desktop.png'), full_page=True)
                page.set_viewport_size({'width': 390, 'height': 844})
                assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
                page.screenshot(path=str(screenshots / 'mobile.png'), full_page=True)
                assert not errors, errors
                browser.close()
            print('Browser checks passed: rates, tiers, invalid states, provider switch, custom devices, save/load, JSON/CSV and mobile layout')
        finally:
            server.shutdown()


if __name__ == '__main__':
    main()
