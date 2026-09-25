"""Logging configuration and optional Sentry error reporting."""
from __future__ import annotations

import logging
import os

_configured = False


def setup_observability(component: str = "api") -> None:
    """Configure root logging (LOG_LEVEL) and Sentry (SENTRY_DSN, optional).

    Safe to call more than once."""
    global _configured
    if _configured:
        return
    _configured = True

    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=getattr(logging, level_name, logging.INFO),
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )

    dsn = os.getenv("SENTRY_DSN")
    if not dsn:
        return
    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=dsn,
            environment=os.getenv("ENVIRONMENT", "development"),
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0")),
            send_default_pii=False,
        )
        sentry_sdk.set_tag("component", component)
    except Exception:
        logging.getLogger(__name__).exception("Failed to initialise Sentry")
