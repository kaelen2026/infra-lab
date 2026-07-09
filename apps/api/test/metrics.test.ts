import { describe, expect, it } from "vitest";
import { createMetrics } from "../src/observability/metrics.js";

describe("createMetrics", () => {
  it("aggregates request counts by method+path+status", () => {
    const m = createMetrics(() => 0);
    m.onRequestStart();
    m.onRequestEnd({ method: "GET", path: "/todos/:id", status: 200, durationMs: 3 });
    m.onRequestStart();
    m.onRequestEnd({ method: "GET", path: "/todos/:id", status: 200, durationMs: 7 });
    m.onRequestStart();
    m.onRequestEnd({ method: "POST", path: "/todos", status: 201, durationMs: 12 });

    const text = m.render();
    expect(text).toContain('http_requests_total{method="GET",path="/todos/:id",status="200"} 2');
    expect(text).toContain('http_requests_total{method="POST",path="/todos",status="201"} 1');
  });

  it("renders a cumulative histogram with sum and count", () => {
    const m = createMetrics(() => 0);
    // 3ms → le=0.005; 30ms → le=0.05; 20s → only +Inf.
    for (const durationMs of [3, 30, 20_000]) {
      m.onRequestStart();
      m.onRequestEnd({ method: "GET", path: "/x", status: 200, durationMs });
    }
    const text = m.render();
    expect(text).toContain('http_request_duration_seconds_bucket{le="0.005"} 1');
    // Cumulative: the 3ms sample also counts under every larger bucket.
    expect(text).toContain('http_request_duration_seconds_bucket{le="0.05"} 2');
    expect(text).toContain('http_request_duration_seconds_bucket{le="10"} 2');
    // +Inf always equals the total count, including the 20s outlier.
    expect(text).toContain('http_request_duration_seconds_bucket{le="+Inf"} 3');
    expect(text).toContain("http_request_duration_seconds_count 3");
    expect(text).toContain(`http_request_duration_seconds_sum ${(3 + 30 + 20_000) / 1000}`);
  });

  it("tracks in-flight requests as a gauge", () => {
    const m = createMetrics(() => 0);
    m.onRequestStart();
    m.onRequestStart();
    expect(m.render()).toContain("http_requests_in_flight 2");
    m.onRequestEnd({ method: "GET", path: "/x", status: 200, durationMs: 1 });
    expect(m.render()).toContain("http_requests_in_flight 1");
  });

  it("exposes the process start time from the injected clock", () => {
    const m = createMetrics(() => 1_700_000_000_000);
    expect(m.render()).toContain("process_start_time_seconds 1700000000");
  });

  it("escapes label values", () => {
    const m = createMetrics(() => 0);
    m.onRequestStart();
    m.onRequestEnd({ method: "GET", path: '/we"ird\\path', status: 404, durationMs: 1 });
    expect(m.render()).toContain('path="/we\\"ird\\\\path"');
  });
});
