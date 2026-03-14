export interface VisitRevenueBenchmark {
  cptCode: string | null;
  amountCents: number;
  source: 'actual_charges' | 'cms_2026_median_nonfacility' | 'none';
  label: string;
  usesBenchmark: boolean;
}

export interface VisitRevenueBenchmarkInput {
  appointmentTypeName?: string | null;
  durationMinutes?: number | null;
}

// Derived from the CMS 2026 PFS Relative Value File (updated March 10, 2026),
// using the median non-facility allowed amount across localities for common
// office/outpatient E/M visit codes.
export const CMS_2026_MEDIAN_NONFACILITY_VISIT_RATES_CENTS = {
  '99202': 8166,
  '99203': 13360,
  '99204': 20382,
  '99212': 5788,
  '99213': 9561,
  '99214': 13178,
} as const;

type BenchmarkVisitCode = keyof typeof CMS_2026_MEDIAN_NONFACILITY_VISIT_RATES_CENTS;

export const CMS_2026_VISIT_RATE_SOURCE_NOTE =
  'Completed visits without posted charges use a CMS 2026 non-facility Medicare benchmark estimate.';

function rateFor(cptCode: BenchmarkVisitCode): number {
  return CMS_2026_MEDIAN_NONFACILITY_VISIT_RATES_CENTS[cptCode];
}

function normalizeName(value?: string | null): string {
  return (value || '').trim().toLowerCase();
}

function isProcedureDrivenAppointment(name: string): boolean {
  return /(procedure|laser|botox|peel|biopsy|excision|mohs|surgery|cosmetic|filler|hair removal|phototherapy|patch)/i.test(
    name
  );
}

function isConsultLikeAppointment(name: string): boolean {
  return /(consult|new patient|new pt|np visit|initial visit)/i.test(name);
}

function isEstablishedVisitAppointment(name: string): boolean {
  return /(follow.?up|recheck|return visit|skin check|skin exam|annual skin|full skin exam|fse|med check|follow up)/i.test(
    name
  );
}

export function inferVisitRevenueBenchmark(
  input: VisitRevenueBenchmarkInput
): VisitRevenueBenchmark {
  const name = normalizeName(input.appointmentTypeName);
  const durationMinutes = Number.isFinite(input.durationMinutes as number)
    ? Math.max(0, Number(input.durationMinutes))
    : 0;

  if (!name) {
    return {
      cptCode: null,
      amountCents: 0,
      source: 'none',
      label: 'No visit benchmark',
      usesBenchmark: false,
    };
  }

  if (isProcedureDrivenAppointment(name)) {
    return {
      cptCode: null,
      amountCents: 0,
      source: 'none',
      label: 'Procedure-driven visit',
      usesBenchmark: false,
    };
  }

  if (isConsultLikeAppointment(name)) {
    const cptCode: BenchmarkVisitCode = durationMinutes >= 45 ? '99204' : '99203';
    return {
      cptCode,
      amountCents: rateFor(cptCode),
      source: 'cms_2026_median_nonfacility',
      label: `Consult benchmark (${cptCode})`,
      usesBenchmark: true,
    };
  }

  if (isEstablishedVisitAppointment(name)) {
    const cptCode: BenchmarkVisitCode = durationMinutes >= 25 ? '99214' : '99213';
    return {
      cptCode,
      amountCents: rateFor(cptCode),
      source: 'cms_2026_median_nonfacility',
      label: `Follow-up benchmark (${cptCode})`,
      usesBenchmark: true,
    };
  }

  return {
    cptCode: null,
    amountCents: 0,
    source: 'none',
    label: 'No visit benchmark',
    usesBenchmark: false,
  };
}
