import { expect, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object for Clinical Encounter Page
 * Handles creating and documenting patient encounters
 */
export class EncounterPage extends BasePage {
  // Encounter sections
  private readonly chiefComplaintInput = () => this.page.getByLabel(/chief complaint|cc/i);
  private readonly hpiInput = () => this.page.getByLabel(/hpi|history of present illness/i);
  private readonly rosInput = () => this.page.getByLabel(/ros|review of systems/i);
  private readonly examInput = () => this.page.getByLabel(/exam|physical exam/i);
  private readonly assessmentInput = () => this.page.getByLabel(/assessment|diagnosis/i);
  private readonly planInput = () => this.page.getByLabel(/plan|treatment plan/i);

  // Vitals section
  private readonly addVitalsButton = () => this.page.getByRole('button', { name: /add vitals|vitals/i });
  private readonly bloodPressureInput = () => this.page.getByLabel(/blood pressure|bp/i);
  private readonly heartRateInput = () => this.page.getByLabel(/heart rate|pulse/i);
  private readonly temperatureInput = () => this.page.getByLabel(/temperature|temp/i);
  private readonly weightInput = () => this.page.getByLabel(/weight/i);
  private readonly heightInput = () => this.page.getByLabel(/height/i);

  // Diagnosis
  private readonly addDiagnosisButton = () => this.page.getByRole('button', { name: /add diagnosis|diagnosis/i });
  private readonly diagnosisCodeInput = () => this.page.getByLabel(/icd|diagnosis code/i);
  private readonly diagnosisDescriptionInput = () => this.page.getByLabel(/description/i);

  // Orders and prescriptions
  private readonly addOrderButton = () => this.page.getByRole('button', { name: /add order|new order/i });
  private readonly addPrescriptionButton = () => this.page.getByRole('button', { name: /add prescription|prescribe/i });

  // Actions
  private readonly saveButton = () => this.page.getByRole('button', { name: /^save$/i });
  private readonly signButton = () => this.page.getByRole('button', { name: /sign|finalize/i });
  private readonly lockButton = () => this.page.getByRole('button', { name: /lock/i });

  // Templates
  private readonly templateSelect = () => this.page.getByLabel(/template|note template/i);

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to new encounter page
   */
  async gotoNewEncounter(patientId: string): Promise<void> {
    await this.page.goto(`/patients/${patientId}/encounter/new`);
    await this.waitForPageLoad();
  }

  /**
   * Navigate to existing encounter
   */
  async gotoEncounter(patientId: string, encounterId: string): Promise<void> {
    await this.page.goto(`/patients/${patientId}/encounter/${encounterId}`);
    await this.waitForPageLoad();
  }

  /**
   * Fill chief complaint
   */
  async fillChiefComplaint(complaint: string): Promise<void> {
    await this.chiefComplaintInput().fill(complaint);
  }

  /**
   * Fill HPI
   */
  async fillHPI(hpi: string): Promise<void> {
    await this.hpiInput().fill(hpi);
  }

  /**
   * Fill ROS
   */
  async fillROS(ros: string): Promise<void> {
    await this.rosInput().fill(ros);
  }

  /**
   * Fill physical exam
   */
  async fillExam(exam: string): Promise<void> {
    await this.examInput().fill(exam);
  }

  /**
   * Fill assessment
   */
  async fillAssessment(assessment: string): Promise<void> {
    await this.assessmentInput().fill(assessment);
  }

  /**
   * Fill plan
   */
  async fillPlan(plan: string): Promise<void> {
    await this.planInput().fill(plan);
  }

  /**
   * Add vitals
   */
  async addVitals(vitals: {
    bloodPressure?: string;
    heartRate?: string;
    temperature?: string;
    weight?: string;
    height?: string;
  }): Promise<void> {
    // Click add vitals if it's a button
    const addBtn = this.addVitalsButton();
    if (await addBtn.isVisible()) {
      await addBtn.click();
    }

    if (vitals.bloodPressure) {
      await this.bloodPressureInput().fill(vitals.bloodPressure);
    }

    if (vitals.heartRate) {
      await this.heartRateInput().fill(vitals.heartRate);
    }

    if (vitals.temperature) {
      await this.temperatureInput().fill(vitals.temperature);
    }

    if (vitals.weight) {
      await this.weightInput().fill(vitals.weight);
    }

    if (vitals.height) {
      await this.heightInput().fill(vitals.height);
    }
  }

  /**
   * Add diagnosis
   */
  async addDiagnosis(code: string, description: string): Promise<void> {
    await this.addDiagnosisButton().click();
    await this.diagnosisCodeInput().fill(code);
    await this.diagnosisDescriptionInput().fill(description);
  }

  /**
   * Save encounter
   */
  async save(): Promise<void> {
    await this.saveButton().click();
    await this.page.waitForTimeout(1000);
  }

  /**
   * Sign encounter
   */
  async sign(): Promise<void> {
    await this.signButton().click();
    await this.page.waitForTimeout(1000);
  }

  /**
   * Lock encounter
   */
  async lock(): Promise<void> {
    await this.lockButton().click();
    const confirmBtn = this.page.getByRole('button', { name: /confirm|yes/i });
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
    }
  }

  /**
   * Select a note template
   */
  async selectTemplate(templateName: string): Promise<void> {
    await this.templateSelect().selectOption(templateName);
  }

  /**
   * Complete basic encounter
   */
  async completeBasicEncounter(note: {
    chiefComplaint: string;
    hpi: string;
    ros: string;
    exam: string;
    assessment: string;
    plan: string;
  }): Promise<void> {
    await this.fillChiefComplaint(note.chiefComplaint);
    await this.fillHPI(note.hpi);
    await this.fillROS(note.ros);
    await this.fillExam(note.exam);
    await this.fillAssessment(note.assessment);
    await this.fillPlan(note.plan);
    await this.save();
  }

  /**
   * Assert encounter is saved
   */
  async assertSaved(): Promise<void> {
    const successMsg = this.page.getByText(/saved|success/i);
    await expect(successMsg).toBeVisible({ timeout: 5000 });
  }

  /**
   * Assert encounter is signed
   */
  async assertSigned(): Promise<void> {
    const status = this.page.getByText(/signed/i);
    await expect(status).toBeVisible();
  }
}
