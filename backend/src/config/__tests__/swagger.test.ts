import swaggerJsdoc from "swagger-jsdoc";
import { swaggerSpec } from "../swagger";

jest.mock("swagger-jsdoc", () => ({
  __esModule: true,
  default: jest.fn(() => ({ openapi: "3.0.0" })),
}));

describe("swagger config", () => {
  it("exports swagger spec", () => {
    expect(swaggerSpec).toEqual({ openapi: "3.0.0" });
    expect(swaggerJsdoc).toHaveBeenCalled();
  });
});
