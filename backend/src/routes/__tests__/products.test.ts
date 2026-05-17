import request from "supertest";
import express from "express";
import { productsRouter } from "../products";
import * as productSalesService from "../../services/productSalesService";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "admin" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

const app = express();
app.use(express.json());
app.use("/products", productsRouter);

describe("Products routes", () => {
  it("GET /products/inventory/status returns empty status when products table is missing", async () => {
    const spy = jest
      .spyOn(productSalesService, "getInventoryStatus")
      .mockRejectedValueOnce(Object.assign(new Error("missing products"), { code: "42P01" }));

    const res = await request(app).get("/products/inventory/status");

    expect(res.status).toBe(200);
    expect(res.body.status).toEqual({
      totalProducts: 0,
      totalValue: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      byCategory: [],
    });

    spy.mockRestore();
  });

  it("GET /products/sales/report reaches the report route before sale detail route", async () => {
    const report = {
      summary: {
        totalSales: 1,
        grossRevenue: 100,
        netRevenue: 100,
        totalDiscount: 0,
      },
      byCategory: [],
      byProduct: [],
      byStaff: [],
    };
    const reportSpy = jest.spyOn(productSalesService, "getSalesReport").mockResolvedValueOnce(report as any);
    const saleSpy = jest.spyOn(productSalesService, "getSale").mockResolvedValueOnce(null as any);

    const res = await request(app).get("/products/sales/report?category=skincare");

    expect(res.status).toBe(200);
    expect(res.body.report).toEqual(report);
    expect(reportSpy).toHaveBeenCalledWith("tenant-1", {
      startDate: undefined,
      endDate: undefined,
      category: "skincare",
      soldBy: undefined,
    });
    expect(saleSpy).not.toHaveBeenCalled();

    reportSpy.mockRestore();
    saleSpy.mockRestore();
  });

  it("GET /products/sales reaches the store order route before product detail route", async () => {
    const orders = [
      {
        id: "sale-1",
        tenantId: "tenant-1",
        patientId: "patient-1",
        total: 1200,
        fulfillmentStatus: "paid",
      },
    ];
    const orderSpy = jest.spyOn(productSalesService, "getStoreOrders").mockResolvedValueOnce(orders as any);
    const productSpy = jest.spyOn(productSalesService, "getProduct").mockResolvedValueOnce(null as any);

    const res = await request(app).get("/products/sales");

    expect(res.status).toBe(200);
    expect(res.body.orders).toEqual(orders);
    expect(orderSpy).toHaveBeenCalledWith("tenant-1", {
      startDate: undefined,
      endDate: undefined,
      fulfillmentStatus: undefined,
      search: undefined,
      limit: undefined,
    });
    expect(productSpy).not.toHaveBeenCalled();

    orderSpy.mockRestore();
    productSpy.mockRestore();
  });
});
