import { Router } from "express";
import { requireAuth } from "../middleware/auth";

export const templatesRouter = Router();

templatesRouter.get("/notes", requireAuth, (_req, res) => {
  res.json({
    templates: [
      {
        id: "tpl-rash",
        name: "Derm Rash",
        chiefComplaint: "Rash",
        hpi: "Patient reports itchy rash on forearm for 2 weeks.",
        ros: "Skin: positive for rash. No fever, no chills.",
        exam: "Erythematous patch with mild scaling on left forearm.",
        assessmentPlan: "Likely eczema; start topical steroid; follow-up in 2 weeks.",
      },
      {
        id: "tpl-acne",
        name: "Acne Follow-up",
        chiefComplaint: "Acne follow-up",
        hpi: "Acne improving on current regimen; occasional flares.",
        ros: "No systemic symptoms.",
        exam: "Mild comedonal acne on forehead; few papules.",
        assessmentPlan: "Continue topical retinoid; add benzoyl peroxide; recheck in 6 weeks.",
      },
      {
        id: "tpl-bx",
        name: "Shave Biopsy",
        chiefComplaint: "Changing lesion",
        hpi: "Lesion darkening over 3 months; no bleeding.",
        ros: "No fever, weight loss, or night sweats.",
        exam: "6mm irregularly pigmented papule on right shoulder.",
        assessmentPlan: "Shave biopsy performed; wound care reviewed; pathology pending.",
      },
      {
        id: "tpl-fbse",
        name: "Full Body Skin Exam",
        chiefComplaint: "Skin check",
        hpi: "Routine skin cancer screening; no specific lesions of concern.",
        ros: "Denies new or changing moles; no systemic symptoms.",
        exam: "No suspicious lesions; scattered benign nevi and lentigines.",
        assessmentPlan: "Sun protection counseling; yearly follow-up; return sooner for changes.",
      },
      {
        id: "tpl-eczema-flare",
        name: "Eczema Flare",
        chiefComplaint: "Itchy patches",
        hpi: "Pruritic plaques on flexural surfaces worsening in winter.",
        ros: "Skin: positive for pruritus; no fevers.",
        exam: "Excoriated erythematous patches in antecubital fossae; mild lichenification.",
        assessmentPlan: "High-potency topical steroid BID x2 weeks; emollients; trigger avoidance; follow-up 4 weeks.",
      },
    ],
  });
});
