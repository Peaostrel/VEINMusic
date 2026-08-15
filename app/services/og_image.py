"""Social Share OpenGraph & Statistics Cards Generator (SVG / High-Res Cards)."""
from __future__ import annotations

import html
from typing import Any


def _escape(val: Any) -> str:
    if val is None:
        return ""
    return html.escape(str(val), quote=True)


def generate_recap_card_svg(
    username: str,
    period_title: str,
    total_scrobbles: int,
    total_hours: float,
    top_artists: list[tuple[str, int]],
    top_genre: str = "Various",
) -> str:
    """Generate high-res 1200x630 social share card for Weekly/Monthly recap."""
    escaped_user = _escape(username)
    escaped_period = _escape(period_title)
    escaped_genre = _escape(top_genre or "Eclectic")

    artist_rows = []
    for i, (artist, count) in enumerate(top_artists[:5]):
        y = 300 + (i * 54)
        escaped_a = _escape(artist)
        artist_rows.append(f"""
        <g transform="translate(620, {y})">
            <rect width="520" height="42" rx="10" fill="rgba(255, 255, 255, 0.03)" stroke="rgba(255, 255, 255, 0.06)"/>
            <text x="20" y="26" fill="#ef4444" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="900">0{i+1}</text>
            <text x="60" y="26" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700">{escaped_a[:28]}</text>
            <text x="500" y="26" text-anchor="end" fill="#a1a1aa" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600">{count} plays</text>
        </g>
        """)

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" fill="none">
    <defs>
        <linearGradient id="recap_bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#0e0e11"/>
            <stop offset="50%" stop-color="#141418"/>
            <stop offset="100%" stop-color="#09090b"/>
        </linearGradient>
        <linearGradient id="accent_grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#ef4444"/>
            <stop offset="100%" stop-color="#f97316"/>
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="60" result="blur"/>
        </filter>
    </defs>

    <rect width="1200" height="630" fill="url(#recap_bg)"/>

    <!-- Ambient Glow Orbs -->
    <circle cx="150" cy="150" r="140" fill="#ef4444" opacity="0.12" filter="url(#glow)"/>
    <circle cx="1050" cy="480" r="180" fill="#f97316" opacity="0.10" filter="url(#glow)"/>

    <!-- Outer Border -->
    <rect x="20" y="20" width="1160" height="590" rx="24" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1.5"/>

    <!-- Header / Brand -->
    <g transform="translate(60, 60)">
        <rect width="40" height="40" rx="10" fill="url(#accent_grad)"/>
        <text x="20" y="26" text-anchor="middle" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="18" font-weight="900">V</text>
        <text x="56" y="28" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="22" font-weight="900" letter-spacing="2">VEIN MUSIC</text>
        <rect x="220" y="8" width="130" height="28" rx="14" fill="rgba(239, 68, 68, 0.15)" stroke="rgba(239, 68, 68, 0.3)"/>
        <text x="285" y="26" text-anchor="middle" fill="#ef4444" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="12" font-weight="800" letter-spacing="1">RECAP</text>
    </g>

    <!-- User & Title -->
    <g transform="translate(60, 140)">
        <text x="0" y="0" fill="#71717a" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="700" letter-spacing="1.5">МУЗЫКАЛЬНЫЕ ИТОГИ</text>
        <text x="0" y="44" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="44" font-weight="900">@{escaped_user}</text>
        <text x="0" y="80" fill="#a1a1aa" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="20" font-weight="500">{escaped_period}</text>
    </g>

    <!-- Left Stats Grid -->
    <g transform="translate(60, 280)">
        <!-- Scrobbles Box -->
        <rect width="240" height="120" rx="16" fill="rgba(255, 255, 255, 0.03)" stroke="rgba(255, 255, 255, 0.08)"/>
        <text x="24" y="40" fill="#71717a" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="13" font-weight="700" letter-spacing="1">СКРОББЛОВ</text>
        <text x="24" y="86" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="36" font-weight="900">{total_scrobbles:,}</text>

        <!-- Hours Box -->
        <g transform="translate(260, 0)">
            <rect width="240" height="120" rx="16" fill="rgba(255, 255, 255, 0.03)" stroke="rgba(255, 255, 255, 0.08)"/>
            <text x="24" y="40" fill="#71717a" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="13" font-weight="700" letter-spacing="1">ВРЕМЯ В МУЗЫКЕ</text>
            <text x="24" y="86" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="36" font-weight="900">{total_hours:.1f} ч</text>
        </g>

        <!-- Top Genre Box -->
        <g transform="translate(0, 140)">
            <rect width="500" height="90" rx="16" fill="rgba(255, 255, 255, 0.03)" stroke="rgba(255, 255, 255, 0.08)"/>
            <text x="24" y="36" fill="#71717a" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="13" font-weight="700" letter-spacing="1">ГЛАВНЫЙ ЖАНР</text>
            <text x="24" y="68" fill="#ef4444" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="24" font-weight="800">{escaped_genre}</text>
        </g>
    </g>

    <!-- Right Top Artists Header -->
    <text x="620" y="270" fill="#a1a1aa" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="14" font-weight="800" letter-spacing="1.5">ТОП ИСПОЛНИТЕЛЕЙ</text>
    {''.join(artist_rows)}

    <!-- Footer URL -->
    <text x="1140" y="580" text-anchor="end" fill="#52525b" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="14" font-weight="600">music.vein.guru/user/{escaped_user}</text>
</svg>"""


def generate_achievement_card_svg(
    username: str,
    title: str,
    description: str,
    icon: str = "🏆",
    reward_xp: int = 100,
) -> str:
    """Generate high-res social card for an unlocked achievement."""
    escaped_user = _escape(username)
    escaped_title = _escape(title)
    escaped_desc = _escape(description)
    escaped_icon = _escape(icon)

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" fill="none">
    <defs>
        <linearGradient id="ach_bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#121215"/>
            <stop offset="100%" stop-color="#070709"/>
        </linearGradient>
        <filter id="ach_glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="80" result="blur"/>
        </filter>
    </defs>

    <rect width="1200" height="630" fill="url(#ach_bg)"/>
    <circle cx="600" cy="300" r="220" fill="#eab308" opacity="0.12" filter="url(#ach_glow)"/>
    <rect x="20" y="20" width="1160" height="590" rx="24" stroke="rgba(234, 179, 8, 0.2)" stroke-width="1.5"/>

    <g transform="translate(60, 60)">
        <text x="0" y="20" fill="#eab308" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="800" letter-spacing="2">НОВОЕ ДОСТИЖЕНИЕ РАЗБЛОКИРОВАНО</text>
        <text x="0" y="55" fill="#a1a1aa" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="18" font-weight="600">@{escaped_user}</text>
    </g>

    <!-- Center Trophy Icon -->
    <g transform="translate(600, 240)">
        <circle cx="0" cy="0" r="70" fill="rgba(234, 179, 8, 0.15)" stroke="#eab308" stroke-width="2"/>
        <text x="0" y="20" text-anchor="middle" font-size="54">{escaped_icon}</text>
    </g>

    <!-- Achievement Details -->
    <g transform="translate(600, 380)">
        <text x="0" y="0" text-anchor="middle" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="36" font-weight="900">{escaped_title}</text>
        <text x="0" y="40" text-anchor="middle" fill="#a1a1aa" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="20" font-weight="500">{escaped_desc}</text>
        <rect x="-80" y="70" width="160" height="36" rx="18" fill="rgba(234, 179, 8, 0.2)" stroke="#eab308"/>
        <text x="0" y="94" text-anchor="middle" fill="#fef08a" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="15" font-weight="800">+{reward_xp} XP</text>
    </g>

    <text x="600" y="580" text-anchor="middle" fill="#52525b" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="14" font-weight="600">VEIN MUSIC • music.vein.guru</text>
</svg>"""
