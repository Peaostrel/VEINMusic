from app.core.performance import MAX_ROUTES, latency_snapshot, record_request


def test_latency_snapshot_reports_percentiles_and_errors():
    # A long-lived API process can already have sampled the maximum number of
    # route templates. New routes must still become observable.
    for index in range(MAX_ROUTES + 5):
        record_request(f"/test/fill-{index}", 1, 200)
    route = "/test/performance-metrics"
    for value in range(1, 101):
        record_request(route, value, 500 if value == 100 else 200)
    row = next(item for item in latency_snapshot() if item["route"] == route)
    assert row["requests"] == 100
    assert row["p50_ms"] == 51
    assert row["p95_ms"] == 95
    assert row["p99_ms"] == 99
    assert row["errors"] == 1
