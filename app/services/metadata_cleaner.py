import re

# Precise, linear patterns without catastrophic backtracking
CLEAN_PATTERNS = [
    # Remaster
    re.compile(r"\b(?:\d{4}\s+)?(?:digital\s+)?remaster(?:ed)?(?:\s+\d{4})?\b", re.IGNORECASE),
    # Bonus track / Deluxe / Anniversary
    re.compile(r"\b(?:bonus\s+track|deluxe\s+edition|anniversary\s+edition|extended\s+version|original\s+mix)\b", re.IGNORECASE),
    # Live
    re.compile(r"\blive(?:\s+(?:at|in|from|version)\s+[\w\s]+)?\b", re.IGNORECASE),
    # Radio edit / version variants
    re.compile(r"\b(?:radio\s+edit|single\s+version|album\s+version|mono\s+version|stereo\s+version|acoustic\s+version)\b", re.IGNORECASE),
    # Explicit / Clean
    re.compile(r"\b(?:explicit|clean\s+version|clean)\b", re.IGNORECASE),
]

FEAT_PREFIXES = ["feat.", "feat", "ft.", "ft", "featuring"]
FEAT_DELIMITERS = ["(", "[", " - "]
CLOSE_CHARS = [")", "]"]
BRACKET_PAIRS = ["()", "[]", "{}"]
# Single unified pattern for stripping edge noise — no duplicated chars
_EDGE_STRIP = r"[ \t\-–—:/(){}\[\]]+"
EDGE_STRIP_RE = re.compile(r"^" + _EDGE_STRIP + r"|" + _EDGE_STRIP + r"$")
WHITESPACE_RE = re.compile(r"\s+")


def _find_feat_marker(lower_title: str) -> tuple[str, int] | None:
    """Return (delimiter, index) of the first feat marker found, or None."""
    for prefix in FEAT_PREFIXES:
        for delimiter in FEAT_DELIMITERS:
            marker = f"{delimiter}{prefix}"
            idx = lower_title.find(marker)
            if idx != -1:
                return delimiter, idx
    return None


def _extract_closing(content: str) -> str:
    """Strip trailing bracket from content."""
    for close_char in CLOSE_CHARS:
        c_idx = content.find(close_char)
        if c_idx != -1:
            return content[:c_idx]
    return content


def _extract_featured_artists(title: str, artist: str) -> tuple[str, str]:
    lower_title = title.lower()
    result = _find_feat_marker(lower_title)
    if result is None:
        return title, artist

    delimiter, idx = result
    # Determine which prefix was matched
    remaining = lower_title[idx + len(delimiter):]
    matched_prefix = next(p for p in FEAT_PREFIXES if remaining.startswith(p))

    content = title[idx + len(delimiter):]
    content = _extract_closing(content)
    feat_part = content[len(matched_prefix):].strip()

    if feat_part and feat_part.lower() not in artist.lower():
        artist = f"{artist} feat. {feat_part}"
    title = title[:idx].strip()
    return title, artist


def _strip_brackets(title: str) -> str:
    for pair in BRACKET_PAIRS:
        title = title.replace(pair, "")
    return title


def _normalize_whitespace(text: str) -> str:
    return EDGE_STRIP_RE.sub("", WHITESPACE_RE.sub(" ", text)).strip()


def clean_track_metadata(title: str | None, artist: str | None) -> tuple[str, str]:
    """Clean and normalize track title and artist name by removing noisy editions and extracting features."""
    if not title:
        title = "Unknown Track"
    if not artist:
        artist = "Unknown Artist"

    clean_title = title.strip()
    clean_artist = artist.strip()

    # 1. Extract featured artists cleanly
    clean_title, clean_artist = _extract_featured_artists(clean_title, clean_artist)

    # 2. Clean known edition tags
    for pat in CLEAN_PATTERNS:
        clean_title = pat.sub("", clean_title)

    # 3. Clean empty brackets and edge punctuation
    clean_title = _strip_brackets(clean_title)
    clean_title = _normalize_whitespace(clean_title)
    clean_artist = _normalize_whitespace(clean_artist)

    if not clean_title:
        clean_title = title.strip()
    if not clean_artist:
        clean_artist = artist.strip()

    return clean_title, clean_artist
