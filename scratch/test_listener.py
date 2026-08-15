import asyncio
import winsdk.windows.media.control as wmc
from desktop_client.media_listener import WindowsSMTCListener
from desktop_client.scrobbler import DesktopScrobbler

async def test_live():
    listener = WindowsSMTCListener()
    track = await listener.get_current_track()
    print("Detected Track:", track)

asyncio.run(test_live())
