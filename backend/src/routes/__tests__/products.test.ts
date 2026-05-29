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
  it("builds inclusive whole-day product sales date filters", () => {
    const sql = productSalesService.buildProductSaleDateRangeSql(
      "ps.sale_date",
      "2026-05-28",
      "2026-05-28",
      2
    );

    expect(sql).toEqual({
      conditions: [
        "ps.sale_date >= $2::date",
        "ps.sale_date < ($3::date + interval '1 day')",
      ],
      params: ["2026-05-28", "2026-05-28"],
      nextParamIndex: 4,
    });
  });

  it("keeps exact timestamp product sales filters inclusive at the provided instant", () => {
    const sql = productSalesService.buildProductSaleDateRangeSql(
      "ps.sale_date",
      "2026-05-28T12:00:00.000Z",
      "2026-05-28T18:58:00.000Z",
      5
    );

    expect(sql).toEqual({
      conditions: [
        "ps.sale_date >= $5::timestamptz",
        "ps.sale_date <= $6::timestamptz",
      ],
      params: ["2026-05-28T12:00:00.000Z", "2026-05-28T18:58:00.000Z"],
      nextParamIndex: 7,
    });
  });

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

  it("POST /products/promotions/quote returns a server-side store deal quote", async () => {
    const quote = {
      subtotal: 9000,
      itemDiscount: 900,
      shippingDiscount: 595,
      shippingFee: 0,
      tax: 668,
      total: 8768,
      promotionCode: "WELCOME10",
      appliedPromotions: [
        {
          id: "promo-1",
          name: "Welcome 10% Off",
          code: "WELCOME10",
          promotionType: "percentage",
          discountCents: 900,
          minimumSubtotal: 0,
          source: "code",
        },
      ],
    };
    const quoteSpy = jest.spyOn(productSalesService, "calculateStorePromotionQuote").mockResolvedValueOnce(quote as any);

    const res = await request(app)
      .post("/products/promotions/quote")
      .send({
        items: [{ productId: "10000000-0000-4000-8000-000000000001", quantity: 2 }],
        shippingMethod: "standard",
        promotionCode: "WELCOME10",
      });

    expect(res.status).toBe(200);
    expect(res.body.quote).toEqual(quote);
    expect(quoteSpy).toHaveBeenCalledWith("tenant-1", {
      items: [{ productId: "10000000-0000-4000-8000-000000000001", quantity: 2 }],
      shippingMethod: "standard",
      promotionCode: "WELCOME10",
    });

    quoteSpy.mockRestore();
  });

  it("POST /products/promotions creates a provider-managed deal", async () => {
    const promotion = {
      id: "promo-2",
      tenantId: "tenant-1",
      name: "Sale Day 50% Off",
      promotionType: "percentage",
      value: 50,
      minimumSubtotal: 0,
      isActive: true,
      isAutomatic: true,
      redemptionCount: 0,
    };
    const createSpy = jest.spyOn(productSalesService, "createStorePromotion").mockResolvedValueOnce(promotion as any);

    const res = await request(app)
      .post("/products/promotions")
      .send({
        name: "Sale Day 50% Off",
        promotionType: "percentage",
        value: 50,
        minimumSubtotal: 0,
        isActive: true,
        isAutomatic: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.promotion).toEqual(promotion);
    expect(createSpy).toHaveBeenCalledWith(
      "tenant-1",
      {
        name: "Sale Day 50% Off",
        promotionType: "percentage",
        value: 50,
        minimumSubtotal: 0,
        isActive: true,
        isAutomatic: true,
      },
      "user-1"
    );

    createSpy.mockRestore();
  });
});
