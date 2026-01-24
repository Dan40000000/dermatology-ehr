import { messageTemplates } from "../integrations/messageTemplates";

describe("messageTemplates", () => {
  it("appointment_booked builds Slack message with action", () => {
    const message = messageTemplates.appointment_booked.buildSlackMessage({
      patientName: "Pat Patient",
      appointmentType: "Consult",
      scheduledStart: "2025-01-01T10:00:00Z",
      scheduledEnd: "2025-01-01T10:30:00Z",
      providerName: "Dr. Smith",
      locationName: "Main Clinic",
      appointmentUrl: "https://example.com/appointment",
    });

    expect(message.text).toContain("Pat Patient");
    const hasActions = message.blocks?.some((block) => block.type === "actions");
    expect(hasActions).toBe(true);
  });

  it("urgent_message builds Teams message with action", () => {
    const message = messageTemplates.urgent_message.buildTeamsMessage({
      patientName: "Pat Patient",
      messageSubject: "Urgent",
      messagePreview: "Please call back",
      sentAt: "2025-01-01T11:00:00Z",
      messageUrl: "https://example.com/message",
    });

    expect(message.type).toBe("message");
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments[0].content).toMatchObject({ type: "AdaptiveCard" });
    expect(message.attachments[0].content.actions).toHaveLength(1);
  });

  it("daily_schedule_summary builds Slack message with provider list", () => {
    const message = messageTemplates.daily_schedule_summary.buildSlackMessage({
      date: "2025-01-01T00:00:00Z",
      totalAppointments: 5,
      providers: [
        { name: "Dr. Smith", appointmentCount: 3 },
        { name: "Dr. Lee", appointmentCount: 2 },
      ],
      firstAppointmentTime: "2025-01-01T08:00:00Z",
      lastAppointmentTime: "2025-01-01T16:00:00Z",
      scheduleUrl: "https://example.com/schedule",
    });

    expect(message.text).toContain("Daily schedule");
    const hasActions = message.blocks?.some((block) => block.type === "actions");
    expect(hasActions).toBe(true);
  });

  it("builds Slack and Teams messages for all templates", () => {
    const baseDate = "2025-01-01T10:00:00Z";
    const cases = [
      {
        key: "appointment_booked",
        data: {
          patientName: "Pat Patient",
          appointmentType: "Consult",
          scheduledStart: baseDate,
          scheduledEnd: "2025-01-01T10:30:00Z",
          providerName: "Dr. Smith",
          locationName: "Main Clinic",
          appointmentUrl: "https://example.com/appointment",
        },
        text: "Pat Patient",
      },
      {
        key: "appointment_cancelled",
        data: {
          patientName: "Pat Patient",
          appointmentType: "Consult",
          scheduledStart: baseDate,
          providerName: "Dr. Smith",
          cancelReason: "No show",
          appointmentUrl: "https://example.com/appointment",
        },
        text: "Appointment cancelled",
      },
      {
        key: "patient_checked_in",
        data: {
          patientName: "Pat Patient",
          appointmentType: "Consult",
          scheduledStart: baseDate,
          providerName: "Dr. Smith",
          checkedInAt: "2025-01-01T09:50:00Z",
          appointmentUrl: "https://example.com/appointment",
        },
        text: "Patient checked in",
      },
      {
        key: "prior_auth_approved",
        data: {
          patientName: "Pat Patient",
          medication: "Medication X",
          insurancePlan: "ACME",
          approvedAt: baseDate,
          referenceNumber: "AUTH-1",
          priorAuthUrl: "https://example.com/auth",
        },
        text: "Prior auth approved",
      },
      {
        key: "prior_auth_denied",
        data: {
          patientName: "Pat Patient",
          medication: "Medication X",
          insurancePlan: "ACME",
          deniedAt: baseDate,
          denialReason: "Missing info",
          priorAuthUrl: "https://example.com/auth",
        },
        text: "Prior auth denied",
      },
      {
        key: "lab_results_ready",
        data: {
          patientName: "Pat Patient",
          labTest: "Biopsy",
          orderedBy: "Dr. Smith",
          completedAt: baseDate,
          resultsUrl: "https://example.com/results",
        },
        text: "Lab results ready",
      },
      {
        key: "urgent_message",
        data: {
          patientName: "Pat Patient",
          messageSubject: "Urgent",
          messagePreview: "Please call back",
          sentAt: baseDate,
          messageUrl: "https://example.com/message",
        },
        text: "URGENT",
      },
      {
        key: "daily_schedule_summary",
        data: {
          date: baseDate,
          totalAppointments: 5,
          providers: [
            { name: "Dr. Smith", appointmentCount: 3 },
            { name: "Dr. Lee", appointmentCount: 2 },
          ],
          firstAppointmentTime: "2025-01-01T08:00:00Z",
          lastAppointmentTime: "2025-01-01T16:00:00Z",
          scheduleUrl: "https://example.com/schedule",
        },
        text: "Daily schedule",
      },
      {
        key: "end_of_day_report",
        data: {
          date: baseDate,
          totalAppointments: 10,
          completedAppointments: 8,
          cancelledAppointments: 1,
          noShowAppointments: 1,
          totalRevenue: 1234.56,
          reportUrl: "https://example.com/report",
        },
        text: "End of day report",
      },
    ] as const;

    cases.forEach(({ key, data, text }) => {
      const slack = messageTemplates[key].buildSlackMessage(data);
      const teams = messageTemplates[key].buildTeamsMessage(data);

      expect(slack.text).toContain(text);
      expect(teams.type).toBe("message");
      expect(teams.attachments[0].content).toMatchObject({ type: "AdaptiveCard" });
    });
  });
});
