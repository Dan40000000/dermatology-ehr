import { jest } from "@jest/globals";

jest.mock("ioredis", () => {
  const handlers: Record<string, Array<(...args: any[]) => void>> = {};
  const redisMock = {
    on: jest.fn((event: string, handler: (...args: any[]) => void) => {
      handlers[event] = handlers[event] || [];
      handlers[event].push(handler);
      return redisMock;
    }),
    get: jest.fn(),
    setex: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    exists: jest.fn(),
    flushdb: jest.fn(),
    ping: jest.fn(),
    quit: jest.fn(),
  };
  const Redis = jest.fn(() => redisMock);
  (Redis as any).__mock = { handlers, redisMock };
  return Redis;
});

jest.mock("../cacheService", () => ({
  cacheService: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    delPattern: jest.fn(),
    exists: jest.fn(),
    clear: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const loadRedisCache = () => {
  jest.resetModules();
  return require("../redisCache");
};

const getRedisMock = () => {
  const Redis = require("ioredis");
  return (Redis as any).__mock as {
    handlers: Record<string, Array<(...args: any[]) => void>>;
    redisMock: {
      on: jest.Mock;
      get: jest.Mock;
      setex: jest.Mock;
      set: jest.Mock;
      del: jest.Mock;
      keys: jest.Mock;
      exists: jest.Mock;
      flushdb: jest.Mock;
      ping: jest.Mock;
      quit: jest.Mock;
    };
  };
};

const getMemoryCacheMock = () => require("../cacheService").cacheService as {
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  delPattern: jest.Mock;
  exists: jest.Mock;
  clear: jest.Mock;
};

describe("redisCache service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.REDIS_URL;
    delete process.env.REDIS_CONNECTION_STRING;
  });

  afterEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.REDIS_CONNECTION_STRING;
  });

  it("uses in-memory cache when Redis is not configured", async () => {
    const { redisCache } = loadRedisCache();
    const memoryCache = getMemoryCacheMock();

    memoryCache.get.mockResolvedValueOnce("value");
    const value = await redisCache.get("key");
    expect(value).toBe("value");
    expect(memoryCache.get).toHaveBeenCalledWith("key");

    await redisCache.set("key", { ok: true }, 120);
    expect(memoryCache.set).toHaveBeenCalledWith("key", { ok: true }, 120);

    await redisCache.del("key");
    expect(memoryCache.del).toHaveBeenCalledWith("key");

    memoryCache.delPattern.mockResolvedValueOnce(2);
    const removed = await redisCache.delPattern("patients:*");
    expect(removed).toBe(2);

    memoryCache.exists.mockResolvedValueOnce(true);
    const exists = await redisCache.exists("key");
    expect(exists).toBe(true);

    await redisCache.clear();
    expect(memoryCache.clear).toHaveBeenCalled();

    const health = await redisCache.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.type).toBe("memory");

    expect(redisCache.getStats().type).toBe("memory");
  });

  it("uses redis when connected and updates stats", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    const { redisCache } = loadRedisCache();
    const { handlers, redisMock } = getRedisMock();

    const Redis = require("ioredis") as jest.Mock;
    const options = Redis.mock.calls[0][1];
    expect(options.retryStrategy(2)).toBe(200);
    expect(options.retryStrategy(11)).toBeNull();
    expect(options.reconnectOnError(new Error("READONLY replica"))).toBe(true);
    expect(options.reconnectOnError(new Error("other"))).toBe(false);

    handlers.connect.forEach((fn) => fn());

    redisMock.get.mockResolvedValueOnce(null).mockResolvedValueOnce(JSON.stringify({ ok: true }));
    expect(await redisCache.get("missing")).toBeNull();
    expect(await redisCache.get("hit")).toEqual({ ok: true });

    await redisCache.set("key", { a: 1 }, 10);
    await redisCache.set("key2", { b: 2 }, 0);
    expect(redisMock.setex).toHaveBeenCalledWith("key", 10, JSON.stringify({ a: 1 }));
    expect(redisMock.set).toHaveBeenCalledWith("key2", JSON.stringify({ b: 2 }));

    await redisCache.del("key");
    expect(redisMock.del).toHaveBeenCalledWith("key");

    redisMock.exists.mockResolvedValueOnce(1);
    expect(await redisCache.exists("key")).toBe(true);

    const stats = redisCache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.type).toBe("redis");
    expect(redisCache.getClient()).toBe(redisMock);
  });

  it("falls back to memory on redis errors and supports health checks", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    const { redisCache } = loadRedisCache();
    const { handlers, redisMock } = getRedisMock();
    const memoryCache = getMemoryCacheMock();

    handlers.connect.forEach((fn) => fn());

    redisMock.get.mockRejectedValueOnce(new Error("redis down"));
    memoryCache.get.mockResolvedValueOnce("from-memory");
    const value = await redisCache.get("key");
    expect(value).toBe("from-memory");

    redisMock.keys.mockResolvedValueOnce(["a", "b"]);
    redisMock.del.mockResolvedValueOnce(2);
    const removed = await redisCache.delPattern("foo:*");
    expect(removed).toBe(2);

    redisMock.ping.mockResolvedValueOnce("PONG");
    const healthy = await redisCache.healthCheck();
    expect(healthy.healthy).toBe(true);
    expect(healthy.type).toBe("redis");

    redisMock.ping.mockRejectedValueOnce(new Error("ping failed"));
    const unhealthy = await redisCache.healthCheck();
    expect(unhealthy.healthy).toBe(false);
    expect(unhealthy.type).toBe("redis");
  });

  it("handles redis errors for set and delete", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    const { redisCache } = loadRedisCache();
    const { handlers, redisMock } = getRedisMock();
    const memoryCache = getMemoryCacheMock();

    handlers.connect.forEach((fn) => fn());

    redisMock.setex.mockRejectedValueOnce(new Error("set failed"));
    memoryCache.set.mockResolvedValueOnce(undefined);
    await redisCache.set("key", { value: 1 }, 5);
    expect(memoryCache.set).toHaveBeenCalledWith("key", { value: 1 }, 5);

    redisMock.del.mockRejectedValueOnce(new Error("del failed"));
    memoryCache.del.mockResolvedValueOnce(undefined);
    await redisCache.del("key");
    expect(memoryCache.del).toHaveBeenCalledWith("key");

    redisCache.resetStats();
    const stats = redisCache.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });

  it("getOrSet returns cached values and closes redis connection", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    const { redisCache } = loadRedisCache();
    const { handlers, redisMock } = getRedisMock();

    handlers.connect.forEach((fn) => fn());

    redisMock.get.mockResolvedValueOnce(JSON.stringify({ cached: true }));
    const cached = await redisCache.getOrSet("key", jest.fn());
    expect(cached).toEqual({ cached: true });

    const fetchFn = jest.fn().mockResolvedValue({ cached: false });
    redisMock.get.mockResolvedValueOnce(null);
    await redisCache.getOrSet("key2", fetchFn, 5);
    expect(fetchFn).toHaveBeenCalled();
    expect(redisMock.setex).toHaveBeenCalledWith("key2", 5, JSON.stringify({ cached: false }));

    redisMock.quit.mockResolvedValueOnce("OK");
    await redisCache.close();
    expect(redisCache.getClient()).toBeNull();
  });

  it("exposes cache keys, TTLs, and invalidation helpers", async () => {
    const { CacheKeys, CacheTTL, invalidateCache, redisCache } = loadRedisCache();

    expect(CacheKeys.patient("p1")).toBe("patient:p1");
    expect(CacheKeys.patientList("t1", 2)).toBe("patients:t1:page:2");
    expect(CacheTTL.SHORT).toBe(60);
    expect(CacheTTL.SESSION).toBe(7200);

    const delSpy = jest.spyOn(redisCache, "del").mockResolvedValue();
    const delPatternSpy = jest.spyOn(redisCache, "delPattern").mockResolvedValue(0);

    await invalidateCache.patient("p1", "t1");
    await invalidateCache.appointment("a1", "t1");
    await invalidateCache.providers("t1");
    await invalidateCache.locations("t1");
    await invalidateCache.appointmentTypes("t1");

    expect(delSpy).toHaveBeenCalledWith("patient:p1");
    expect(delPatternSpy).toHaveBeenCalledWith("patients:t1:page:*");
  });
});
