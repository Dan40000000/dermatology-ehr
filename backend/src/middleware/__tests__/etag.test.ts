import request from "supertest";
import express from "express";
import { generateETag, etagMiddleware, etagWithCache } from "../etag";

describe("etag middleware", () => {
  it("generateETag is stable for same payload", () => {
    const one = generateETag({ ok: true });
    const two = generateETag({ ok: true });
    expect(one).toBe(two);
  });

  it("etagMiddleware sets headers for GET", async () => {
    const app = express();
    app.use(etagMiddleware);
    app.get("/data", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/data");

    expect(res.status).toBe(200);
    expect(res.headers.etag).toBeTruthy();
    expect(res.headers["cache-control"]).toContain("max-age");
  });

  it("etagMiddleware returns 304 on If-None-Match", async () => {
    const app = express();
    app.use(etagMiddleware);
    app.get("/data", (_req, res) => res.json({ ok: true }));

    const first = await request(app).get("/data");
    const etag = first.headers.etag;

    const res = await request(app).get("/data").set("If-None-Match", etag);

    expect(res.status).toBe(304);
  });

  it("etagWithCache sets custom max-age", async () => {
    const app = express();
    app.use(etagWithCache(120));
    app.get("/data", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/data");

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, max-age=120");
  });

  it("etagWithCache ignores non-GET", async () => {
    const app = express();
    app.use(etagWithCache(120));
    app.post("/data", (_req, res) => res.json({ ok: true }));

    const res = await request(app).post("/data");

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).not.toBe("private, max-age=120");
  });
});
