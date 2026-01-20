import { SlackMessage, TeamsMessage, NotificationType } from "./types";
import { SlackService } from "./slackService";
import { TeamsService } from "./teamsService";

interface MessageTemplate {
  buildSlackMessage(data: any): SlackMessage;
  buildTeamsMessage(data: any): TeamsMessage;
}

/**
 * Format date and time
 */
function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format time only
 */
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Template for new appointment booked
 */
const appointmentBookedTemplate: MessageTemplate = {
  buildSlackMessage(data: {
    patientName: string;
    appointmentType: string;
    scheduledStart: string;
    scheduledEnd: string;
    providerName: string;
    locationName: string;
    appointmentUrl?: string;
  }): SlackMessage {
    const blocks = [
      SlackService.createHeaderBlock("📅", "New Appointment Booked"),
      SlackService.createFieldsBlock([
        { label: "Patient", value: data.patientName },
        { label: "Type", value: data.appointmentType },
        { label: "Date & Time", value: formatDateTime(data.scheduledStart) },
        { label: "Duration", value: `${formatTime(data.scheduledStart)} - ${formatTime(data.scheduledEnd)}` },
        { label: "Provider", value: data.providerName },
        { label: "Location", value: data.locationName },
      ]),
      SlackService.createDivider(),
      SlackService.createContext(`Booked on ${new Date().toLocaleString()}`),
    ];

    if (data.appointmentUrl) {
      blocks.splice(blocks.length - 2, 0, SlackService.createActionsBlock([
        { text: "View Appointment", url: data.appointmentUrl },
      ]));
    }

    return {
      text: `New appointment: ${data.patientName} with ${data.providerName}`,
      blocks,
    };
  },

  buildTeamsMessage(data: {
    patientName: string;
    appointmentType: string;
    scheduledStart: string;
    scheduledEnd: string;
    providerName: string;
    locationName: string;
    appointmentUrl?: string;
  }): TeamsMessage {
    const teamsService = new TeamsService();
    const facts = [
      TeamsService.createFact("Patient", data.patientName),
      TeamsService.createFact("Type", data.appointmentType),
      TeamsService.createFact("Date & Time", formatDateTime(data.scheduledStart)),
      TeamsService.createFact("Duration", `${formatTime(data.scheduledStart)} - ${formatTime(data.scheduledEnd)}`),
      TeamsService.createFact("Provider", data.providerName),
      TeamsService.createFact("Location", data.locationName),
    ];

    const actions = data.appointmentUrl
      ? [TeamsService.createAction("View Appointment", data.appointmentUrl)]
      : [];

    const card = teamsService.createAdaptiveCard({
      title: "📅 New Appointment Booked",
      text: `${data.patientName} has booked an appointment with ${data.providerName}`,
      themeColor: "0078D4",
      facts,
      actions,
    });

    return {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: card,
        },
      ],
    };
  },
};

/**
 * Template for appointment cancelled
 */
const appointmentCancelledTemplate: MessageTemplate = {
  buildSlackMessage(data: {
    patientName: string;
    appointmentType: string;
    scheduledStart: string;
    providerName: string;
    cancelReason?: string;
    appointmentUrl?: string;
  }): SlackMessage {
    const fields = [
      { label: "Patient", value: data.patientName },
      { label: "Type", value: data.appointmentType },
      { label: "Original Date & Time", value: formatDateTime(data.scheduledStart) },
      { label: "Provider", value: data.providerName },
    ];

    if (data.cancelReason) {
      fields.push({ label: "Reason", value: data.cancelReason });
    }

    const blocks = [
      SlackService.createHeaderBlock("❌", "Appointment Cancelled"),
      SlackService.createFieldsBlock(fields),
      SlackService.createDivider(),
      SlackService.createContext(`Cancelled on ${new Date().toLocaleString()}`),
    ];

    if (data.appointmentUrl) {
      blocks.splice(blocks.length - 2, 0, SlackService.createActionsBlock([
        { text: "View Details", url: data.appointmentUrl },
      ]));
    }

    return {
      text: `Appointment cancelled: ${data.patientName} with ${data.providerName}`,
      blocks,
    };
  },

  buildTeamsMessage(data: {
    patientName: string;
    appointmentType: string;
    scheduledStart: string;
    providerName: string;
    cancelReason?: string;
    appointmentUrl?: string;
  }): TeamsMessage {
    const teamsService = new TeamsService();
    const facts = [
      TeamsService.createFact("Patient", data.patientName),
      TeamsService.createFact("Type", data.appointmentType),
      TeamsService.createFact("Original Date & Time", formatDateTime(data.scheduledStart)),
      TeamsService.createFact("Provider", data.providerName),
    ];

    if (data.cancelReason) {
      facts.push(TeamsService.createFact("Reason", data.cancelReason));
    }

    const actions = data.appointmentUrl
      ? [TeamsService.createAction("View Details", data.appointmentUrl)]
      : [];

    const card = teamsService.createAdaptiveCard({
      title: "❌ Appointment Cancelled",
      text: `Appointment for ${data.patientName} has been cancelled`,
      themeColor: "E81123",
      facts,
      actions,
    });

    return {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: card,
        },
      ],
    };
  },
};

/**
 * Template for patient checked in
 */
const patientCheckedInTemplate: MessageTemplate = {
  buildSlackMessage(data: {
    patientName: string;
    appointmentType: string;
    scheduledStart: string;
    providerName: string;
    checkedInAt: string;
    appointmentUrl?: string;
  }): SlackMessage {
    const blocks = [
      SlackService.createHeaderBlock("✅", "Patient Checked In"),
      SlackService.createFieldsBlock([
        { label: "Patient", value: data.patientName },
        { label: "Type", value: data.appointmentType },
        { label: "Scheduled Time", value: formatTime(data.scheduledStart) },
        { label: "Provider", value: data.providerName },
        { label: "Checked In At", value: formatTime(data.checkedInAt) },
      ]),
      SlackService.createDivider(),
      SlackService.createContext(`Check-in at ${formatDateTime(data.checkedInAt)}`),
    ];

    if (data.appointmentUrl) {
      blocks.splice(blocks.length - 2, 0, SlackService.createActionsBlock([
        { text: "View Appointment", url: data.appointmentUrl },
      ]));
    }

    return {
      text: `Patient checked in: ${data.patientName}`,
      blocks,
    };
  },

  buildTeamsMessage(data: {
    patientName: string;
    appointmentType: string;
    scheduledStart: string;
    providerName: string;
    checkedInAt: string;
    appointmentUrl?: string;
  }): TeamsMessage {
    const teamsService = new TeamsService();
    const facts = [
      TeamsService.createFact("Patient", data.patientName),
      TeamsService.createFact("Type", data.appointmentType),
      TeamsService.createFact("Scheduled Time", formatTime(data.scheduledStart)),
      TeamsService.createFact("Provider", data.providerName),
      TeamsService.createFact("Checked In At", formatTime(data.checkedInAt)),
    ];

    const actions = data.appointmentUrl
      ? [TeamsService.createAction("View Appointment", data.appointmentUrl)]
      : [];

    const card = teamsService.createAdaptiveCard({
      title: "✅ Patient Checked In",
      text: `${data.patientName} has checked in for their appointment`,
      themeColor: "00C851",
      facts,
      actions,
    });

    return {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: card,
        },
      ],
    };
  },
};

/**
 * Template for prior auth approved
 */
const priorAuthApprovedTemplate: MessageTemplate = {
  buildSlackMessage(data: {
    patientName: string;
    medication: string;
    insurancePlan: string;
    approvedAt: string;
    referenceNumber?: string;
    priorAuthUrl?: string;
  }): SlackMessage {
    const fields = [
      { label: "Patient", value: data.patientName },
      { label: "Medication", value: data.medication },
      { label: "Insurance", value: data.insurancePlan },
      { label: "Approved At", value: formatDateTime(data.approvedAt) },
    ];

    if (data.referenceNumber) {
      fields.push({ label: "Reference #", value: data.referenceNumber });
    }

    const blocks = [
      SlackService.createHeaderBlock("✅", "Prior Authorization Approved"),
      SlackService.createFieldsBlock(fields),
      SlackService.createDivider(),
      SlackService.createContext(`Approved on ${formatDateTime(data.approvedAt)}`),
    ];

    if (data.priorAuthUrl) {
      blocks.splice(blocks.length - 2, 0, SlackService.createActionsBlock([
        { text: "View Authorization", url: data.priorAuthUrl, style: "primary" },
      ]));
    }

    return {
      text: `Prior auth approved: ${data.medication} for ${data.patientName}`,
      blocks,
    };
  },

  buildTeamsMessage(data: {
    patientName: string;
    medication: string;
    insurancePlan: string;
    approvedAt: string;
    referenceNumber?: string;
    priorAuthUrl?: string;
  }): TeamsMessage {
    const teamsService = new TeamsService();
    const facts = [
      TeamsService.createFact("Patient", data.patientName),
      TeamsService.createFact("Medication", data.medication),
      TeamsService.createFact("Insurance", data.insurancePlan),
      TeamsService.createFact("Approved At", formatDateTime(data.approvedAt)),
    ];

    if (data.referenceNumber) {
      facts.push(TeamsService.createFact("Reference #", data.referenceNumber));
    }

    const actions = data.priorAuthUrl
      ? [TeamsService.createAction("View Authorization", data.priorAuthUrl, "positive")]
      : [];

    const card = teamsService.createAdaptiveCard({
      title: "✅ Prior Authorization Approved",
      text: `Prior authorization for ${data.medication} has been approved for ${data.patientName}`,
      themeColor: "00C851",
      facts,
      actions,
    });

    return {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: card,
        },
      ],
    };
  },
};

/**
 * Template for prior auth denied
 */
const priorAuthDeniedTemplate: MessageTemplate = {
  buildSlackMessage(data: {
    patientName: string;
    medication: string;
    insurancePlan: string;
    deniedAt: string;
    denialReason?: string;
    priorAuthUrl?: string;
  }): SlackMessage {
    const fields = [
      { label: "Patient", value: data.patientName },
      { label: "Medication", value: data.medication },
      { label: "Insurance", value: data.insurancePlan },
      { label: "Denied At", value: formatDateTime(data.deniedAt) },
    ];

    if (data.denialReason) {
      fields.push({ label: "Reason", value: data.denialReason });
    }

    const blocks = [
      SlackService.createHeaderBlock("⚠️", "Prior Authorization Denied"),
      SlackService.createFieldsBlock(fields),
      SlackService.createDivider(),
      SlackService.createContext(`Denied on ${formatDateTime(data.deniedAt)}`),
    ];

    if (data.priorAuthUrl) {
      blocks.splice(blocks.length - 2, 0, SlackService.createActionsBlock([
        { text: "View Authorization", url: data.priorAuthUrl, style: "danger" },
      ]));
    }

    return {
      text: `Prior auth denied: ${data.medication} for ${data.patientName}`,
      blocks,
    };
  },

  buildTeamsMessage(data: {
    patientName: string;
    medication: string;
    insurancePlan: string;
    deniedAt: string;
    denialReason?: string;
    priorAuthUrl?: string;
  }): TeamsMessage {
    const teamsService = new TeamsService();
    const facts = [
      TeamsService.createFact("Patient", data.patientName),
      TeamsService.createFact("Medication", data.medication),
      TeamsService.createFact("Insurance", data.insurancePlan),
      TeamsService.createFact("Denied At", formatDateTime(data.deniedAt)),
    ];

    if (data.denialReason) {
      facts.push(TeamsService.createFact("Reason", data.denialReason));
    }

    const actions = data.priorAuthUrl
      ? [TeamsService.createAction("View Authorization", data.priorAuthUrl, "destructive")]
      : [];

    const card = teamsService.createAdaptiveCard({
      title: "⚠️ Prior Authorization Denied",
      text: `Prior authorization for ${data.medication} has been denied for ${data.patientName}`,
      themeColor: "FFB900",
      facts,
      actions,
    });

    return {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: card,
        },
      ],
    };
  },
};

/**
 * Template for lab results ready
 */
const labResultsReadyTemplate: MessageTemplate = {
  buildSlackMessage(data: {
    patientName: string;
    labTest: string;
    orderedBy: string;
    completedAt: string;
    resultsUrl?: string;
  }): SlackMessage {
    const blocks = [
      SlackService.createHeaderBlock("🔬", "Lab Results Ready"),
      SlackService.createFieldsBlock([
        { label: "Patient", value: data.patientName },
        { label: "Lab Test", value: data.labTest },
        { label: "Ordered By", value: data.orderedBy },
        { label: "Completed At", value: formatDateTime(data.completedAt) },
      ]),
      SlackService.createDivider(),
      SlackService.createContext(`Results available as of ${formatDateTime(data.completedAt)}`),
    ];

    if (data.resultsUrl) {
      blocks.splice(blocks.length - 2, 0, SlackService.createActionsBlock([
        { text: "View Results", url: data.resultsUrl, style: "primary" },
      ]));
    }

    return {
      text: `Lab results ready for ${data.patientName}`,
      blocks,
    };
  },

  buildTeamsMessage(data: {
    patientName: string;
    labTest: string;
    orderedBy: string;
    completedAt: string;
    resultsUrl?: string;
  }): TeamsMessage {
    const teamsService = new TeamsService();
    const facts = [
      TeamsService.createFact("Patient", data.patientName),
      TeamsService.createFact("Lab Test", data.labTest),
      TeamsService.createFact("Ordered By", data.orderedBy),
      TeamsService.createFact("Completed At", formatDateTime(data.completedAt)),
    ];

    const actions = data.resultsUrl
      ? [TeamsService.createAction("View Results", data.resultsUrl, "positive")]
      : [];

    const card = teamsService.createAdaptiveCard({
      title: "🔬 Lab Results Ready",
      text: `Lab results are now available for ${data.patientName}`,
      themeColor: "0078D4",
      facts,
      actions,
    });

    return {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: card,
        },
      ],
    };
  },
};

/**
 * Template for urgent message
 */
const urgentMessageTemplate: MessageTemplate = {
  buildSlackMessage(data: {
    patientName: string;
    messageSubject: string;
    messagePreview: string;
    sentAt: string;
    messageUrl?: string;
  }): SlackMessage {
    const blocks = [
      SlackService.createHeaderBlock("🚨", "Urgent Message Received"),
      SlackService.createFieldsBlock([
        { label: "Patient", value: data.patientName },
        { label: "Subject", value: data.messageSubject },
        { label: "Preview", value: data.messagePreview },
        { label: "Received At", value: formatDateTime(data.sentAt) },
      ]),
      SlackService.createDivider(),
      SlackService.createContext(`Urgent message received at ${formatDateTime(data.sentAt)}`),
    ];

    if (data.messageUrl) {
      blocks.splice(blocks.length - 2, 0, SlackService.createActionsBlock([
        { text: "View Message", url: data.messageUrl, style: "danger" },
      ]));
    }

    return {
      text: `URGENT: Message from ${data.patientName}`,
      blocks,
    };
  },

  buildTeamsMessage(data: {
    patientName: string;
    messageSubject: string;
    messagePreview: string;
    sentAt: string;
    messageUrl?: string;
  }): TeamsMessage {
    const teamsService = new TeamsService();
    const facts = [
      TeamsService.createFact("Patient", data.patientName),
      TeamsService.createFact("Subject", data.messageSubject),
      TeamsService.createFact("Preview", data.messagePreview),
      TeamsService.createFact("Received At", formatDateTime(data.sentAt)),
    ];

    const actions = data.messageUrl
      ? [TeamsService.createAction("View Message", data.messageUrl, "destructive")]
      : [];

    const card = teamsService.createAdaptiveCard({
      title: "🚨 Urgent Message Received",
      subtitle: "Immediate Attention Required",
      text: `An urgent message has been received from ${data.patientName}`,
      themeColor: "E81123",
      facts,
      actions,
    });

    return {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: card,
        },
      ],
    };
  },
};

/**
 * Template for daily schedule summary
 */
const dailyScheduleSummaryTemplate: MessageTemplate = {
  buildSlackMessage(data: {
    date: string;
    totalAppointments: number;
    providers: Array<{ name: string; appointmentCount: number }>;
    firstAppointmentTime?: string;
    lastAppointmentTime?: string;
    scheduleUrl?: string;
  }): SlackMessage {
    const providerSummary = data.providers
      .map((p) => `• ${p.name}: ${p.appointmentCount} appointment${p.appointmentCount !== 1 ? "s" : ""}`)
      .join("\n");

    const blocks = [
      SlackService.createHeaderBlock("📊", "Daily Schedule Summary"),
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Date:* ${formatDateTime(data.date).split(",")[0]}\n*Total Appointments:* ${data.totalAppointments}\n\n*By Provider:*\n${providerSummary}`,
        },
      },
    ];

    if (data.firstAppointmentTime && data.lastAppointmentTime) {
      blocks.push(
        SlackService.createFieldsBlock([
          { label: "First Appointment", value: formatTime(data.firstAppointmentTime) },
          { label: "Last Appointment", value: formatTime(data.lastAppointmentTime) },
        ])
      );
    }

    blocks.push(SlackService.createDivider());
    blocks.push(SlackService.createContext(`Summary for ${formatDateTime(data.date).split(",")[0]}`));

    if (data.scheduleUrl) {
      blocks.splice(blocks.length - 2, 0, SlackService.createActionsBlock([
        { text: "View Full Schedule", url: data.scheduleUrl },
      ]));
    }

    return {
      text: `Daily schedule: ${data.totalAppointments} appointments`,
      blocks,
    };
  },

  buildTeamsMessage(data: {
    date: string;
    totalAppointments: number;
    providers: Array<{ name: string; appointmentCount: number }>;
    firstAppointmentTime?: string;
    lastAppointmentTime?: string;
    scheduleUrl?: string;
  }): TeamsMessage {
    const teamsService = new TeamsService();
    const facts = [
      TeamsService.createFact("Date", formatDateTime(data.date).split(",")[0]!),
      TeamsService.createFact("Total Appointments", data.totalAppointments.toString()),
    ];

    data.providers.forEach((p) => {
      facts.push(TeamsService.createFact(p.name, `${p.appointmentCount} appointments`));
    });

    if (data.firstAppointmentTime && data.lastAppointmentTime) {
      facts.push(TeamsService.createFact("First Appointment", formatTime(data.firstAppointmentTime)));
      facts.push(TeamsService.createFact("Last Appointment", formatTime(data.lastAppointmentTime)));
    }

    const actions = data.scheduleUrl
      ? [TeamsService.createAction("View Full Schedule", data.scheduleUrl)]
      : [];

    const card = teamsService.createAdaptiveCard({
      title: "📊 Daily Schedule Summary",
      text: `Summary of appointments for ${formatDateTime(data.date).split(",")[0]}`,
      themeColor: "0078D4",
      facts,
      actions,
    });

    return {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: card,
        },
      ],
    };
  },
};

/**
 * Template for end of day report
 */
const endOfDayReportTemplate: MessageTemplate = {
  buildSlackMessage(data: {
    date: string;
    totalAppointments: number;
    completedAppointments: number;
    cancelledAppointments: number;
    noShowAppointments: number;
    totalRevenue?: number;
    reportUrl?: string;
  }): SlackMessage {
    const completionRate = data.totalAppointments > 0
      ? Math.round((data.completedAppointments / data.totalAppointments) * 100)
      : 0;

    const fields = [
      { label: "Total Appointments", value: data.totalAppointments.toString() },
      { label: "Completed", value: data.completedAppointments.toString() },
      { label: "Cancelled", value: data.cancelledAppointments.toString() },
      { label: "No-Show", value: data.noShowAppointments.toString() },
      { label: "Completion Rate", value: `${completionRate}%` },
    ];

    if (data.totalRevenue !== undefined) {
      fields.push({ label: "Total Revenue", value: `$${data.totalRevenue.toFixed(2)}` });
    }

    const blocks = [
      SlackService.createHeaderBlock("📈", "End of Day Report"),
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Date:* ${formatDateTime(data.date).split(",")[0]}`,
        },
      },
      SlackService.createFieldsBlock(fields),
      SlackService.createDivider(),
      SlackService.createContext(`Report for ${formatDateTime(data.date).split(",")[0]}`),
    ];

    if (data.reportUrl) {
      blocks.splice(blocks.length - 2, 0, SlackService.createActionsBlock([
        { text: "View Full Report", url: data.reportUrl },
      ]));
    }

    return {
      text: `End of day report: ${data.completedAppointments}/${data.totalAppointments} completed`,
      blocks,
    };
  },

  buildTeamsMessage(data: {
    date: string;
    totalAppointments: number;
    completedAppointments: number;
    cancelledAppointments: number;
    noShowAppointments: number;
    totalRevenue?: number;
    reportUrl?: string;
  }): TeamsMessage {
    const teamsService = new TeamsService();
    const completionRate = data.totalAppointments > 0
      ? Math.round((data.completedAppointments / data.totalAppointments) * 100)
      : 0;

    const facts = [
      TeamsService.createFact("Date", formatDateTime(data.date).split(",")[0]!),
      TeamsService.createFact("Total Appointments", data.totalAppointments.toString()),
      TeamsService.createFact("Completed", data.completedAppointments.toString()),
      TeamsService.createFact("Cancelled", data.cancelledAppointments.toString()),
      TeamsService.createFact("No-Show", data.noShowAppointments.toString()),
      TeamsService.createFact("Completion Rate", `${completionRate}%`),
    ];

    if (data.totalRevenue !== undefined) {
      facts.push(TeamsService.createFact("Total Revenue", `$${data.totalRevenue.toFixed(2)}`));
    }

    const actions = data.reportUrl
      ? [TeamsService.createAction("View Full Report", data.reportUrl)]
      : [];

    const card = teamsService.createAdaptiveCard({
      title: "📈 End of Day Report",
      text: `Daily performance summary for ${formatDateTime(data.date).split(",")[0]}`,
      themeColor: "5C2D91",
      facts,
      actions,
    });

    return {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: card,
        },
      ],
    };
  },
};

/**
 * Message templates registry
 */
export const messageTemplates: Record<NotificationType, MessageTemplate> = {
  appointment_booked: appointmentBookedTemplate,
  appointment_cancelled: appointmentCancelledTemplate,
  patient_checked_in: patientCheckedInTemplate,
  prior_auth_approved: priorAuthApprovedTemplate,
  prior_auth_denied: priorAuthDeniedTemplate,
  lab_results_ready: labResultsReadyTemplate,
  urgent_message: urgentMessageTemplate,
  daily_schedule_summary: dailyScheduleSummaryTemplate,
  end_of_day_report: endOfDayReportTemplate,
};
