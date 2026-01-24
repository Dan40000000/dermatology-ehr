/**
 * Types Tests
 */

import { Pool, PoolClient } from "pg";
import { isPoolClient } from "../types.js";

describe("types", () => {
  describe("isPoolClient", () => {
    it("should return true for PoolClient", () => {
      const mockClient = {
        release: jest.fn(),
        query: jest.fn(),
      } as unknown as PoolClient;

      expect(isPoolClient(mockClient)).toBe(true);
    });

    it("should return false for Pool", () => {
      const mockPool = {
        connect: jest.fn(),
        query: jest.fn(),
        // Pool doesn't have 'release' method
      } as unknown as Pool;

      expect(isPoolClient(mockPool)).toBe(false);
    });
  });
});
