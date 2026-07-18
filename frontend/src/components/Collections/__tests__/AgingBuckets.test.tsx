import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AgingBuckets, type AgingPatient } from "../AgingBuckets";

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("../../../api", () => ({
  api: apiMocks,
}));

vi.mock("../../../contexts/AuthContext", () => ({
  useAuth: () => ({
    session: {
      tenantId: "tenant-1",
      accessToken: "token-1",
      user: { id: "user-1", email: "admin@example.com", role: "admin", fullName: "Admin User" },
    },
  }),
}));

describe("AgingBuckets", () => {
  beforeEach(() => {
    apiMocks.get.mockReset();
    apiMocks.post.mockReset();
    apiMocks.get.mockResolvedValue({ attempts: [] });
    apiMocks.post.mockResolvedValue({ id: "attempt-1" });
  });

  it("saves string numeric balances as numeric amountDue values", async () => {
    const patient = {
      patientId: "p1",
      patientName: "Jamie Patient",
      totalBalance: "225.00",
      currentBalance: 0,
      balance31_60: 0,
      balance61_90: 0,
      balanceOver90: "225.00",
      oldestChargeDate: "2026-03-01T00:00:00.000Z",
    } as unknown as AgingPatient;

    render(
      <AgingBuckets
        buckets={{
          current: 0,
          days31_60: 0,
          days61_90: 0,
          over90: 225,
          total: 225,
          patientCount: 1,
        }}
        patients={[patient]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Over 90 days/i }));
    fireEvent.click(screen.getByRole("button", { name: /Jamie Patient/i }));

    await waitFor(() => expect(apiMocks.get).toHaveBeenCalled());

    fireEvent.change(screen.getByRole("textbox", { name: /What they said/i }), {
      target: { value: "Patient will call billing tomorrow." },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Internal note/i }), {
      target: { value: "Documented during AR follow-up." },
    });

    fireEvent.click(screen.getByRole("button", { name: /Save Contact Note/i }));

    await waitFor(() => expect(apiMocks.post).toHaveBeenCalled());
    expect(apiMocks.post.mock.calls[0][3]).toEqual(
      expect.objectContaining({
        amountDue: 225,
        patientResponse: "Patient will call billing tomorrow.",
        notes: "Documented during AR follow-up.",
      })
    );
  });
});
