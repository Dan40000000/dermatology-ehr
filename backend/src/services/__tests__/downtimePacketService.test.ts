process.env.PATIENT_SCHEDULING_TIME_ZONE = "America/Denver";

import {
  getTargetDowntimePacketDate,
  hasReachedDowntimePacketCutoff,
} from "../downtimePacketService";

describe("downtimePacketService date targeting", () => {
  it("always uses the next business day before the cutoff on a weekday", () => {
    const date = getTargetDowntimePacketDate("12:00", new Date("2026-04-14T11:15:00"));
    expect(date).toBe("2026-04-15");
  });

  it("uses the next business day after the cutoff", () => {
    const date = getTargetDowntimePacketDate("12:00", new Date("2026-04-14T13:15:00"));
    expect(date).toBe("2026-04-15");
  });

  it("jumps Friday afternoon to Monday", () => {
    const date = getTargetDowntimePacketDate("12:00", new Date("2026-04-17T15:00:00"));
    expect(date).toBe("2026-04-20");
  });

  it("keeps weekends pointed at Monday", () => {
    const date = getTargetDowntimePacketDate("12:00", new Date("2026-04-18T09:00:00"));
    expect(date).toBe("2026-04-20");
  });
});

describe("downtimePacketService cutoff targeting", () => {
  it("waits for the configured cutoff on weekdays", () => {
    expect(hasReachedDowntimePacketCutoff("12:00", new Date("2026-04-14T17:59:00.000Z"))).toBe(false);
    expect(hasReachedDowntimePacketCutoff("12:00", new Date("2026-04-14T18:00:00.000Z"))).toBe(true);
  });

  it("treats weekends as ready for the next business day packet", () => {
    expect(hasReachedDowntimePacketCutoff("12:00", new Date("2026-04-18T09:00:00.000Z"))).toBe(true);
  });
});
