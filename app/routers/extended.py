"""Aggregates the feature routers that used to live in this single module.

The endpoints were split into topic modules (users, stats, discovery,
achievements, integrations, media, platform); this module keeps the original
``router`` (included by ``app.main``) and re-exports helpers for backwards
compatibility with existing imports.
"""
from fastapi import APIRouter

from app.routers import (
    achievements,
    discovery,
    integrations,
    media,
    platform,
    stats,
    users,
)
from app.routers.common import (  # noqa: F401
    _check_privacy_and_owner,
    _get_request_user,
    _get_visible_user,
)
from app.services.achievements import (  # noqa: F401
    check_auto_achievements,
    run_check_achievements_bg,
)
from app.services.cache import get_from_cache, set_to_cache  # noqa: F401
from app.services.lastfm_import import (  # noqa: F401
    IMPORTING_USERS,
    import_lastfm_history,
)
from app.services.taste import get_taste_match_internal, get_taste_twins  # noqa: F401
from app.services.user_stats import (  # noqa: F401
    get_active_streak,
    get_user_level_info,
    get_user_timezone_offset,
)

router = APIRouter()
for _module in (users, stats, discovery, achievements, integrations, media, platform):
    router.include_router(_module.router)
