import { expect, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object for Appointment Creation/Editing
 * Handles creating and modifying appointments
 */
export class AppointmentPage extends BasePage {
  // Form fields
  private readonly patientSelect = () => this.page.getByLabel(/patient/i);
  private readonly providerSelect = () => this.page.getByLabel(/provider|doctor/i);
  private readonly appointmentTypeSelect = () => this.page.getByLabel(/type|appointment type/i);
  private readonly dateInput = () => this.page.getByLabel(/date/i);
  private readonly timeInput = () => this.page.getByLabel(/time|start time/i);
  private readonly durationInput = () => this.page.getByLabel(/duration/i);
  private readonly reasonInput = () => this.page.getByLabel(/reason|chief complaint/i);
  private readonly notesInput = () => this.page.getByLabel(/notes|comments/i);

  // Buttons
  private readonly saveButton = () => this.page.getByRole('button', { name: /save|create|schedule/i });
  private readonly cancelButton = () => this.page.getByRole('button', { name: /cancel/i });
  private readonly rescheduleButton = () => this.page.getByRole('button', { name: /reschedule/i });
  private readonly cancelAppointmentButton = () => this.page.getByRole('button', { name: /cancel appointment/i });
  private readonly checkInButton = () => this.page.getByRole('button', { name: /check.?in/i });
  private readonly noShowButton = () => this.page.getByRole('button', { name: /no.?show/i });

  // Status
  private readonly statusBadge = () => this.page.locator('[data-testid="appointment-status"], .status, .badge');

  // Confirmation dialogs
  private readonly confirmButton = () => this.page.getByRole('button', { name: /confirm|yes|ok/i });

  constructor(page: Page) {
    super(page);
  }

  /**
   * Fill appointment form
   */
  async fillAppointmentForm(appointment: {
    patient?: string;
    provider?: string;
    type?: string;
    date?: string;
    time?: string;
    duration?: string;
    reason?: string;
    notes?: string;
  }): Promise<void> {
    if (appointment.patient) {
      await this.patientSelect().selectOption(appointment.patient);
    }

    if (appointment.provider) {
      await this.providerSelect().selectOption(appointment.provider);
    }

    if (appointment.type) {
      await this.appointmentTypeSelect().selectOption(appointment.type);
    }

    if (appointment.date) {
      await this.dateInput().fill(appointment.date);
    }

    if (appointment.time) {
      await this.timeInput().fill(appointment.time);
    }

    if (appointment.duration) {
      await this.durationInput().fill(appointment.duration);
    }

    if (appointment.reason) {
      await this.reasonInput().fill(appointment.reason);
    }

    if (appointment.notes) {
      await this.notesInput().fill(appointment.notes);
    }
  }

  /**
   * Save the appointment
   */
  async saveAppointment(): Promise<void> {
    await this.saveButton().click();
    await this.page.waitForTimeout(1000);
  }

  /**
   * Create a new appointment
   */
  async createAppointment(appointment: {
    patient: string;
    provider: string;
    type: string;
    date: string;
    time: string;
    reason?: string;
  }): Promise<void> {
    await this.fillAppointmentForm(appointment);
    await this.saveAppointment();
  }

  /**
   * Click check-in button
   */
  async checkInPatient(): Promise<void> {
    await this.checkInButton().click();
    await this.page.waitForTimeout(500);
  }

  /**
   * Click reschedule button
   */
  async clickReschedule(): Promise<void> {
    await this.rescheduleButton().click();
  }

  /**
   * Cancel the appointment
   */
  async cancelAppointment(): Promise<void> {
    await this.cancelAppointmentButton().click();
    // Confirm if dialog appears
    const confirmBtn = this.confirmButton();
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
    }
  }

  /**
   * Mark appointment as no-show
   */
  async markAsNoShow(): Promise<void> {
    await this.noShowButton().click();
    const confirmBtn = this.confirmButton();
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
    }
  }

  /**
   * Assert appointment status
   */
  async assertStatus(status: string): Promise<void> {
    await expect(this.statusBadge()).toContainText(status, { ignoreCase: true });
  }

  /**
   * Assert success message
   */
  async assertSuccess(): Promise<void> {
    const successMsg = this.page.getByText(/success|scheduled|saved/i);
    await expect(successMsg).toBeVisible({ timeout: 5000 });
  }
}
