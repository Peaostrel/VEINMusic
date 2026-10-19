"""Small bounded in-process API latency sampler for operational diagnostics."""

from collections import defaultdict, deque
from threading import Lock

MAX_ROUTES = 120
SAMPLES_PER_ROUTE = 300
_samples: dict[str, deque[tuple[float, bool]]] = defaultdict(
    lambda: deque(maxlen=SAMPLES_PER_ROUTE)
)
_lock = Lock()


def record_request(route: str, elapsed_ms: float, status_code: int) -> None:
    with _lock:
        if route not in _samples and len(_samples) >= MAX_ROUTES:
            # Keep the sampler bounded without permanently freezing the first
            # routes seen after process startup. Dicts preserve insertion
            # order, so discard the oldest inactive route for the new one.
            del _samples[next(iter(_samples))]
        _samples[route].append((max(0.0, elapsed_ms), status_code >= 500))


def _percentile(values: list[float], quantile: float) -> float:
    if not values:
        return 0.0
    index = round((len(values) - 1) * quantile)
    return round(values[index], 1)


def latency_snapshot() -> list[dict[str, object]]:
    with _lock:
        copied = {route: list(values) for route, values in _samples.items()}
    result = []
    for route, samples in copied.items():
        values = sorted(value for value, _ in samples)
        result.append({
            "route": route,
            "requests": len(values),
            "p50_ms": _percentile(values, 0.50),
            "p95_ms": _percentile(values, 0.95),
            "p99_ms": _percentile(values, 0.99),
            "errors": sum(1 for _, error in samples if error),
        })
    return sorted(result, key=lambda item: float(item["p95_ms"]), reverse=True)
