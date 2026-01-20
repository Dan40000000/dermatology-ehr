import { expect, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object for Patient Detail Page
 * Handles viewing and editing patient information
 */
export class PatientDetailPage extends BasePage {
  // Tabs
  private readonly chartTab = () => this.page.getByRole('tab', { name: /chart|overview/i });
  private readonly encountersTab = () => this.page.getByRole('tab', { name: /encounters|visits/i });
  private readonly appointmentsTab = () => this.page.getByRole('tab', { name: /appointments/i });
  private readonly documentsTab = () => this.page.getByRole('tab', { name: /documents/i });
  private readonly photosTab = () => this.page.getByRole('tab', { name: /photos/i });
  private readonly insuranceTab = () => this.page.getByRole('tab', { name: /insurance/i });

  // Action buttons
  private readonly newEncounterButton = () => this.page.getByRole('button', { name: /new encounter|start encounter/i });
  private readonly editPatientButton = () => this.page.getByRole('button', { name: /edit|edit patient/i });
  private readonly scheduleAppointmentButton = () => this.page.getByRole('button', { name: /schedule|new appointment/i });

  // Patient info
  private readonly patientName = () => this.page.locator('[data-testid="patient-name"], h1, .patient-name').first();
  private readonly patientDOB = () => this.page.getByText(/DOB|Date of Birth/i);
  private readonly patientPhone = () => this.page.getByText(/phone/i);
  private readonly patientEmail = () => this.page.getByText(/@/);

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to patient detail page by ID
   */
  async gotoPatient(patientId: string): Promise<void> {
    await this.page.goto(`/patients/${patientId}`);
    await this.waitForPageLoad();
  }

  /**
   * Assert patient detail page is visible
   */
  async assertPatientDetailPageVisible(): Promise<void> {
    await expect(this.patientName()).toBeVisible();
  }

  /**
   * Assert patient name is displayed
   */
  async assertPatientName(firstName: string, lastName: string): Promise<void> {
    const name = await this.patientName().textContent();
    expect(name).toContain(firstName);
    expect(name).toContain(lastName);
  }

  /**
   * Click on chart tab
   */
  async goToChartTab(): Promise<void> {
    await this.chartTab().click();
  }

  /**
   * Click on encounters tab
   */
  async goToEncountersTab(): Promise<void> {
    await this.encountersTab().click();
  }

  /**
   * Click on appointments tab
   */
  async goToAppointmentsTab(): Promise<void> {
    await this.appointmentsTab().click();
  }

  /**
   * Click on documents tab
   */
  async goToDocumentsTab(): Promise<void> {
    await this.documentsTab().click();
  }

  /**
   * Click new encounter button
   */
  async clickNewEncounter(): Promise<void> {
    await this.newEncounterButton().click();
    await this.waitForNavigation();
  }

  /**
   * Click edit patient button
   */
  async clickEditPatient(): Promise<void> {
    await this.editPatientButton().click();
  }

  /**
   * Click schedule appointment button
   */
  async clickScheduleAppointment(): Promise<void> {
    await this.scheduleAppointmentButton().click();
  }

  /**
   * Assert specific content is in chart
   */
  async assertChartContains(content: string): Promise<void> {
    const chartContent = this.page.locator('[data-testid="patient-chart"], .chart-content, main');
    await expect(chartContent).toContainText(content);
  }
}
