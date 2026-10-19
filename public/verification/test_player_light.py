import asyncio
import os
import subprocess
import time
from playwright.async_api import async_playwright

async def run():
    public_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    
    # Inicia o servidor HTTP em porta aleatória ou 8998
    server_process = subprocess.Popen(
        ['python', '-m', 'http.server', '8998', '--directory', public_dir],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    time.sleep(1.0)

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(viewport={'width': 1280, 'height': 800})
            page = await context.new_page()

            url = "http://127.0.0.1:8998/player.html?username=washington&password=test"
            await page.goto(url, wait_until="domcontentloaded")
            await page.wait_for_timeout(1000)

            # 1. Verifica tema inicial no html
            initial_theme = await page.get_attribute("html", "data-theme")
            print(f"[TESTE] Tema inicial do HTML: {initial_theme}")

            # 2. Captura screenshot do tema claro
            screenshot_light = os.path.join(public_dir, "verification", "player_light_theme.png")
            await page.screenshot(path=screenshot_light)
            print(f"[TESTE] Screenshot tema claro salvo com sucesso: {screenshot_light}")

            # 3. Testa alternância para o tema escuro
            theme_btn = page.locator("#theme-toggle")
            await theme_btn.click()
            await page.wait_for_timeout(600)

            dark_theme = await page.get_attribute("html", "data-theme")
            print(f"[TESTE] Tema apos alternancia (click 1): {dark_theme}")

            screenshot_dark = os.path.join(public_dir, "verification", "player_dark_theme.png")
            await page.screenshot(path=screenshot_dark)
            print(f"[TESTE] Screenshot tema escuro salvo com sucesso: {screenshot_dark}")

            # 4. Volta para o tema claro
            await theme_btn.click()
            await page.wait_for_timeout(600)
            back_to_light = await page.get_attribute("html", "data-theme")
            print(f"[TESTE] Tema apos retorno (click 2): {back_to_light}")

            await browser.close()
    finally:
        server_process.terminate()
        try:
            server_process.wait(timeout=2)
        except Exception:
            server_process.kill()

if __name__ == '__main__':
    asyncio.run(run())
