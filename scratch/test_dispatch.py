import asyncio
from desktop_client.main import DesktopClientApp
from desktop_client.config import load_config

async def test_run():
    cfg = load_config()
    print("Testing with config:", cfg)
    app = DesktopClientApp(cfg)
    track = await app.listener.get_current_track()
    print("Detected live track:", track)
    if track:
        app._start_new_track(track)
        print("Now playing dispatched successfully!")

asyncio.run(test_run())
