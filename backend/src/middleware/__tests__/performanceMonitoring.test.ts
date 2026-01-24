import request from "supertest";
import express from "express";
import {
  performanceMonitor,
  queryPerformanceMonitor,
  performanceMonitoring,
  requestTimeout,
  getPerformanceStats,
} from "../performanceMonitoring";

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

beforeEach(() => {
  performanceMonitor.reset();
  queryPerformanceMonitor.reset();
});

describe("Performance monitoring", () => {
  it("records metrics and updates stats", () => {
    performanceMonitor.recordMetric({
      endpoint: "/api/test",
      method: "GET",
      duration: 200,
      statusCode: 200,
      timestamp: new Date(),
      tenantId: "tenant-1",
    });

    performanceMonitor.recordMetric({
      endpoint: "/api/test",
      method: "GET",
      duration: 1500,
      statusCode: 500,
      timestamp: new Date(),
      tenantId: "tenant-1",
    });

    const stats = performanceMonitor.getEndpointStats("GET", "/api/test");
    expect(stats?.count).toBe(2);
    expect(stats?.slowCount).toBe(1);
    expect(stats?.errorCount).toBe(1);

    const summary = performanceMonitor.getSummary();
    expect(summary.totalRequests).toBe(2);
    expect(summary.slowRequests).toBe(1);
    expect(summary.errorRequests).toBe(1);
  });

  it("cleans up old metrics", () => {
    performanceMonitor.recordMetric({
      endpoint: "/api/old",
      method: "GET",
      duration: 100,
      statusCode: 200,
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 30),
    });
    performanceMonitor.recordMetric({
      endpoint: "/api/new",
      method: "GET",
      duration: 100,
      statusCode: 200,
      timestamp: new Date(),
    });

    performanceMonitor.cleanup();
    const summary = performanceMonitor.getSummary();
    expect(summary.totalRequests).toBe(1);
  });

  it("queryPerformanceMonitor tracks slow queries", () => {
    queryPerformanceMonitor.recordQuery({
      query: "select * from patients",
      duration: 500,
      timestamp: new Date(),
    });
    queryPerformanceMonitor.recordQuery({
      query: "select * from visits",
      duration: 1500,
      timestamp: new Date(),
    });

    const stats = queryPerformanceMonitor.getQueryStats();
    expect(stats.totalQueries).toBe(2);
    expect(stats.slowQueries).toBe(1);
    expect(queryPerformanceMonitor.getSlowQueries(5)).toHaveLength(1);
  });

  it("performanceMonitoring middleware records requests", async () => {
    const app = express();
    app.use(performanceMonitoring);
    app.get("/ok", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/ok");

    expect(res.status).toBe(200);
    const stats = performanceMonitor.getEndpointStats("GET", "/ok");
    expect(stats?.count).toBe(1);
  });

  it("requestTimeout responds with 504", async () => {
    const app = express();
    app.get("/timeout", requestTimeout(5), (_req, _res) => {});

    const res = await request(app).get("/timeout");

    expect(res.status).toBe(504);
    expect(res.body.error).toBe("Request timeout");
  });

  it("getPerformanceStats supports endpoint filter", async () => {
    performanceMonitor.recordMetric({
      endpoint: "/api/filter",
      method: "GET",
      duration: 120,
      statusCode: 200,
      timestamp: new Date(),
    });

    const app = express();
    app.get("/stats", getPerformanceStats);

    const res = await request(app).get("/stats?endpoint=/api/filter&method=GET");

    expect(res.status).toBe(200);
    expect(res.body.endpoint).toBe("/api/filter");
    expect(res.body.stats.count).toBe(1);
  });
});
