export type ProtocolCategory = 'medical' | 'procedure' | 'cosmetic' | 'administrative';
export type ProtocolStatus = 'draft' | 'active' | 'archived';

export type ProtocolActionType =
  | 'assessment'
  | 'treatment'
  | 'medication'
  | 'procedure'
  | 'lab_order'
  | 'imaging'
  | 'referral'
  | 'patient_instruction'
  | 'decision_point'
  | 'observation';

export interface Protocol {
  id: string;
  tenant_id: string;
  name: string;
  category: ProtocolCategory;
  type: string;
  description?: string;
  indication?: string;
  contraindications?: string;
  version: string;
  status: ProtocolStatus;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  step_count?: number;
  active_applications?: number;
}

export interface ProtocolStep {
  id: string;
  tenant_id: string;
  protocol_id: string;
  step_number: number;
  title: string;
  description?: string;
  action_type: ProtocolActionType;

  // Medication fields
  medication_name?: string;
  medication_dosage?: string;
  medication_frequency?: string;
  medication_duration?: string;

  // Procedure fields
  procedure_code?: string;
  procedure_instructions?: string;

  // Order fields
  order_codes?: string[];

  // Decision point fields
  decision_criteria?: string;

  // Navigation
  next_step_id?: string;
  conditional_next_steps?: ConditionalStep[];

  // Timing
  timing?: string;
  duration_days?: number;

  // Safety
  monitoring_required?: string;
  side_effects?: string;
  warnings?: string;

  created_at: string;
}

export interface ConditionalStep {
  condition: string;
  next_step_id: string;
}

export interface ProtocolOrderSet {
  id: string;
  tenant_id: string;
  protocol_id: string;
  name: string;
  description?: string;
  order_type: 'medication' | 'lab' | 'imaging' | 'procedure' | 'referral' | 'dme';
  order_details: any; // JSON object
  auto_apply: boolean;
  created_at: string;
}

export interface ProtocolHandout {
  id: string;
  tenant_id: string;
  protocol_id: string;
  title: string;
  content: string;
  content_type: 'markdown' | 'html' | 'pdf_url';
  language: string;
  auto_provide: boolean;
  created_at: string;
}

export type ProtocolApplicationStatus = 'active' | 'completed' | 'discontinued' | 'on_hold';

export interface ProtocolApplication {
  id: string;
  tenant_id: string;
  protocol_id: string;
  patient_id: string;
  encounter_id?: string;
  applied_by: string;
  applied_by_name?: string;
  current_step_id?: string;
  current_step_title?: string;
  status: ProtocolApplicationStatus;
  discontinuation_reason?: string;
  notes?: string;
  started_at: string;
  completed_at?: string;
  created_at: string;

  // Additional computed fields
  protocol_name?: string;
  protocol_category?: ProtocolCategory;
  completed_steps?: number;
  total_steps?: number;
}

export interface ProtocolStepCompletion {
  id: string;
  tenant_id: string;
  application_id: string;
  step_id: string;
  completed_by: string;
  outcome: string;
  outcome_notes?: string;
  actual_timing?: string;
  orders_generated?: string[];
  completed_at: string;
}

export interface ProtocolOutcome {
  id: string;
  tenant_id: string;
  application_id: string;
  outcome_type: string;
  outcome_value: string;
  outcome_date: string;
  documented_by?: string;
  notes?: string;
  created_at: string;
}

export interface ProtocolWithDetails extends Protocol {
  steps: ProtocolStep[];
  order_sets: ProtocolOrderSet[];
  handouts: ProtocolHandout[];
}

export interface ProtocolStats {
  total_protocols: number;
  active_protocols: number;
  total_applications: number;
  active_applications: number;
  completed_applications: number;
}

// Form data types for creating/updating
export interface CreateProtocolData {
  name: string;
  category: ProtocolCategory;
  type: string;
  description?: string;
  indication?: string;
  contraindications?: string;
  version?: string;
  status?: ProtocolStatus;
}

export interface CreateProtocolStepData {
  step_number: number;
  title: string;
  description?: string;
  action_type: ProtocolActionType;
  medication_name?: string;
  medication_dosage?: string;
  medication_frequency?: string;
  medication_duration?: string;
  procedure_code?: string;
  procedure_instructions?: string;
  order_codes?: string[];
  decision_criteria?: string;
  next_step_id?: string;
  conditional_next_steps?: ConditionalStep[];
  timing?: string;
  duration_days?: number;
  monitoring_required?: string;
  side_effects?: string;
  warnings?: string;
}

export interface ApplyProtocolData {
  protocol_id: string;
  patient_id: string;
  encounter_id?: string;
  notes?: string;
}

export interface CompleteStepData {
  step_id: string;
  outcome?: string;
  outcome_notes?: string;
  orders_generated?: string[];
}
