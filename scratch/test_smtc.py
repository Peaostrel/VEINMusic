import asyncio
import winsdk.windows.media.control as wmc

async def check_smtc():
    mgr = await wmc.GlobalSystemMediaTransportControlsSessionManager.request_async()
    sessions = mgr.get_sessions()
    print(f"Total SMTC sessions found: {len(sessions)}")
    for i, s in enumerate(sessions):
        app_id = s.source_app_user_model_id
        props = await s.try_get_media_properties_async()
        info = s.get_playback_info()
        status = info.playback_status if info else None
        print(f"[{i}] App: {app_id} | Status: {status} (4=Playing, 3=Paused)")
        if props:
            print(f"    Track: {props.artist} - {props.title} (Album: {props.album_title})")

asyncio.run(check_smtc())
