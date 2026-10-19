import asyncio
import os
import subprocess
import time
from playwright.async_api import async_playwright

async def run():
    public_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    server_process = subprocess.Popen(
        ['python', '-m', 'http.server', '8996', '--directory', public_dir],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    time.sleep(1.0)

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(viewport={'width': 1280, 'height': 800})
            page = await context.new_page()

            now = int(time.time())
            mock_channels = [
                {
                    "type": "live",
                    "name": "Globo SP HD",
                    "group": "Canais Abertos",
                    "epg_id": "globo.sp",
                    "logo": "",
                    "url": "http://stream.example/globo.m3u8",
                    "catchup": 1
                },
                {
                    "type": "live",
                    "name": "ESPN Brasil FHD",
                    "group": "Esportes",
                    "epg_id": "espn.br",
                    "logo": "",
                    "url": "http://stream.example/espn.m3u8",
                    "catchup": 0
                },
                {
                    "type": "live",
                    "name": "Telecine Premium 4K",
                    "group": "Filmes e Séries",
                    "epg_id": "tc.prem",
                    "logo": "",
                    "url": "http://stream.example/tc.m3u8",
                    "catchup": 1
                },
                {
                    "type": "movie",
                    "name": "Interestelar (2014)",
                    "group": "Ficção Científica",
                    "plot": "Uma equipe de exploradores viaja através de um buraco de minhoca no espaço.",
                    "rating": "8.7",
                    "duration": 169,
                    "releaseDate": "2014",
                    "logo": "",
                    "url": "http://stream.example/interstellar.mp4"
                }
            ]

            mock_epg = {
                "globo.sp": [
                    {
                        "start": now - 3600,
                        "stop": now + 1800,
                        "title": "Bom Dia Brasil",
                        "desc": "Telejornal matutino com notícias ao vivo de todo o país."
                    },
                    {
                        "start": now + 1800,
                        "stop": now + 7200,
                        "title": "Mais Você",
                        "desc": "Variedades, culinária e entrevistas."
                    }
                ],
                "espn.br": [
                    {
                        "start": now - 1800,
                        "stop": now + 3600,
                        "title": "SportsCenter Manhã",
                        "desc": "Análise das principais jogadas e gols da rodada."
                    }
                ],
                "tc.prem": [
                    {
                        "start": now - 7200,
                        "stop": now + 3600,
                        "title": "O Poderoso Chefão",
                        "desc": "Clássico do cinema sobre a família mafiosa Corleone."
                    }
                ]
            }

            async def handle_route(route):
                req_url = route.request.url
                if "/api/player/channels.json" in req_url:
                    await route.fulfill(status=200, content_type="application/json", json=mock_channels)
                elif "/api/epg/schedule" in req_url:
                    await route.fulfill(status=200, content_type="application/json", json=mock_epg)
                else:
                    await route.continue_()

            await page.route("**/api/**", handle_route)

            url = "http://127.0.0.1:8996/player.html?username=washington&password=test"
            await page.goto(url, wait_until="domcontentloaded")
            await page.wait_for_timeout(1500)

            # Salva screenshot completo com dados mockados no tema claro
            screenshot_full = os.path.join(public_dir, "verification", "player_light_populated.png")
            await page.screenshot(path=screenshot_full)
            print(f"[TESTE] Screenshot populado do tema claro salvo em: {screenshot_full}")

            # Testa também a aba Filmes (VOD) no tema claro
            movies_tab = page.locator('a[data-type="movie"]')
            await movies_tab.click()
            await page.wait_for_timeout(500)

            screenshot_vod = os.path.join(public_dir, "verification", "player_light_vod.png")
            await page.screenshot(path=screenshot_vod)
            print(f"[TESTE] Screenshot VOD tema claro salvo em: {screenshot_vod}")

            await browser.close()
    finally:
        server_process.terminate()
        try:
            server_process.wait(timeout=2)
        except Exception:
            server_process.kill()

if __name__ == '__main__':
    asyncio.run(run())
