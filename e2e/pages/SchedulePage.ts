import { expect, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object for Schedule/Calendar Page
 * Handles appointment scheduling and calendar management
 */
export class SchedulePage extends BasePage {
  // View controls
  private readonly dayViewButton = () => this.page.getByRole('button', { name: /day|daily/i });
  private readonly weekViewButton = () => this.page.getByRole('button', { name: /week|weekly/i });
  private readonly monthViewButton = () => this.page.getByRole('button', { name: /month|monthly/i });

  // Navigation
  private readonly previousButton = () => this.page.getByRole('button', { name: /previous|prev|◀/i });
  private readonly nextButton = () => this.page.getByRole('button', { name: /next|▶/i });
  private readonly todayButton = () => this.page.getByRole('button', { name: /today/i });

  // Actions
  private readonly newAppointmentButton = () => this.page.getByRole('button', { name: /new appointment|schedule|add appointment/i });

  // Calendar elements
  private readonly calendar = () => this.page.locator('[data-testid="calendar"], .calendar, .schedule-grid');
  private readonly appointmentSlots = () => this.page.locator('[data-testid="appointment-slot"], .appointment, .slot');

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to schedule page
   */
  async goto(): Promise<void> {
    await this.page.goto('/schedule');
    await this.waitForPageLoad();
  }

  /**
   * Assert schedule page is visible
   */
  async assertSchedulePageVisible(): Promise<void> {
    await expect(this.calendar()).toBeVisible();
  }

  /**
   * Switch to day view
   */
  async switchToDayView(): Promise<void> {
    await this.dayViewButton().click();
  }

  /**
   * Switch to week view
   */
  async switchToWeekView(): Promise<void> {
    await this.weekViewButton().click();
  }

  /**
   * Switch to month view
   */
  async switchToMonthView(): Promise<void> {
    await this.monthViewButton().click();
  }

  /**
   * Navigate to previous period
   */
  async goToPrevious(): Promise<void> {
    await this.previousButton().first().click();
    await this.page.waitForTimeout(500);
  }

  /**
   * Navigate to next period
   */
  async goToNext(): Promise<void> {
    await this.nextButton().first().click();
    await this.page.waitForTimeout(500);
  }

  /**
   * Navigate to today
   */
  async goToToday(): Promise<void> {
    await this.todayButton().click();
    await this.page.waitForTimeout(500);
  }

  /**
   * Click new appointment button
   */
  async clickNewAppointment(): Promise<void> {
    await this.newAppointmentButton().first().click();
  }

  /**
   * Click on a specific time slot
   */
  async clickTimeSlot(hour: number): Promise<void> {
    const slot = this.page.locator(`[data-time="${hour}:00"], [data-hour="${hour}"]`).first();
    await slot.click();
  }

  /**
   * Assert appointment exists in schedule
   */
  async assertAppointmentExists(patientName: string): Promise<void> {
    const appointment = this.page.getByText(patientName);
    await expect(appointment).toBeVisible();
  }

  /**
   * Get number of appointments visible
   */
  async getAppointmentCount(): Promise<number> {
    return await this.appointmentSlots().count();
  }

  /**
   * Click on an appointment by patient name
   */
  async clickAppointment(patientName: string): Promise<void> {
    const appointment = this.page.locator(`[data-testid="appointment"], .appointment`).filter({ hasText: patientName });
    await appointment.first().click();
  }
}
