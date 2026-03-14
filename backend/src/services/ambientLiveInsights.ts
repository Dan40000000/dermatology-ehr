export interface LiveSymptomInsight {
  label: string;
  confidence: number;
  evidence?: string;
}

export interface LiveDiagnosisInsight {
  condition: string;
  confidence: number;
  reasoning: string;
  icd10Code?: string;
}

export interface LiveSuggestedTestInsight {
  testName: string;
  urgency: 'routine' | 'soon' | 'urgent';
  rationale: string;
  cptCode?: string;
}

export interface AmbientLiveInsights {
  source: 'heuristic';
  updatedAt: string;
  symptoms: LiveSymptomInsight[];
  workingDiagnoses: LiveDiagnosisInsight[];
  suggestedTests: LiveSuggestedTestInsight[];
}

type WeightedPattern = {
  pattern: RegExp;
  weight: number;
  clue: string;
};

type DiagnosisRule = {
  condition: string;
  icd10Code?: string;
  threshold: number;
  patterns: WeightedPattern[];
  suggestedTests: LiveSuggestedTestInsight[];
};

const symptomRules: Array<{ label: string; patterns: RegExp[] }> = [
  { label: 'Itching / pruritus', patterns: [/\bitch(?:y|ing)?\b/i, /\bprurit/i] },
  { label: 'Rash / eruption', patterns: [/\brash\b/i, /\beruption\b/i, /\bspots?\b/i] },
  { label: 'Pain / tenderness', patterns: [/\bpain(?:ful)?\b/i, /\btender(?:ness)?\b/i, /\bsore\b/i, /\bburning\b/i] },
  { label: 'Redness / erythema', patterns: [/\bred(?:ness)?\b/i, /\berythema/i, /\bflushing\b/i] },
  { label: 'Scaling / flaking', patterns: [/\bscal(?:e|ing|y)\b/i, /\bflak(?:e|ing|y)\b/i, /\bdry\b/i] },
  { label: 'Drainage / crusting', patterns: [/\booz(?:e|ing)\b/i, /\bdrain(?:age)?\b/i, /\bcrust(?:ing)?\b/i] },
  { label: 'Bleeding', patterns: [/\bbleed(?:ing)?\b/i, /\bscab\b/i, /\bwon'?t heal\b/i] },
  { label: 'Hair loss / shedding', patterns: [/\bhair loss\b/i, /\bshedding\b/i, /\bthinning hair\b/i, /\balopecia\b/i] },
  { label: 'Hives / welts', patterns: [/\bhives?\b/i, /\bwelts?\b/i, /\burticaria\b/i] },
  { label: 'Changing lesion / mole concern', patterns: [/\bchanging mole\b/i, /\bmole\b/i, /\bgrowth\b/i, /\blesion\b/i] },
  { label: 'Joint pain / stiffness', patterns: [/\bjoint pain\b/i, /\bstiff(?:ness)?\b/i, /\bswollen joints?\b/i] },
  { label: 'Fatigue / systemic symptoms', patterns: [/\bfatigue\b/i, /\btired\b/i, /\bfever\b/i] },
];

const diagnosisRules: DiagnosisRule[] = [
  {
    condition: 'Atopic dermatitis / eczema',
    icd10Code: 'L20.9',
    threshold: 0.45,
    patterns: [
      { pattern: /\beczema\b/i, weight: 0.45, clue: 'eczema history' },
      { pattern: /\bitch(?:y|ing)?\b/i, weight: 0.2, clue: 'itching' },
      { pattern: /\bdry\b|\bscal(?:e|ing|y)\b/i, weight: 0.15, clue: 'dry or scaly skin' },
      { pattern: /\bflexural\b|\binner elbow\b|\bbehind the knees?\b/i, weight: 0.2, clue: 'typical flexural distribution' },
    ],
    suggestedTests: [
      { testName: 'Patch testing', urgency: 'routine', rationale: 'Consider if dermatitis is recurrent or trigger-related.' },
      { testName: 'Skin biopsy', urgency: 'routine', rationale: 'Useful if morphology is atypical or not responding as expected.' },
    ],
  },
  {
    condition: 'Allergic contact dermatitis',
    icd10Code: 'L23.9',
    threshold: 0.42,
    patterns: [
      { pattern: /\bnew soap\b|\bnew detergent\b|\bfragrance\b|\blotion\b|\bcream\b|\bmakeup\b|\bnickel\b|\bjewelry\b|\bgloves?\b/i, weight: 0.35, clue: 'new or relevant exposure' },
      { pattern: /\bitch(?:y|ing)?\b/i, weight: 0.18, clue: 'itching' },
      { pattern: /\brash\b|\bred\b/i, weight: 0.18, clue: 'rash/redness' },
      { pattern: /\bhands?\b|\bface\b|\bneck\b|\beyelids?\b|\barms?\b/i, weight: 0.12, clue: 'common contact dermatitis distribution' },
    ],
    suggestedTests: [
      { testName: 'Patch testing', urgency: 'routine', rationale: 'Helpful when the history suggests an external allergen trigger.' },
      { testName: 'Skin biopsy', urgency: 'routine', rationale: 'Consider if the eruption is atypical or overlapping with other inflammatory conditions.' },
    ],
  },
  {
    condition: 'Irritant contact dermatitis',
    icd10Code: 'L24.9',
    threshold: 0.4,
    patterns: [
      { pattern: /\bhand sanitizer\b|\bwashing\b|\bcleaning\b|\bchemicals?\b|\bwork exposure\b/i, weight: 0.34, clue: 'irritant exposure' },
      { pattern: /\bdry\b|\bcrack(?:ed|ing)?\b/i, weight: 0.2, clue: 'dry cracked skin' },
      { pattern: /\bhands?\b/i, weight: 0.18, clue: 'hand involvement' },
      { pattern: /\bburning\b|\bsting(?:ing)?\b/i, weight: 0.18, clue: 'burning or stinging' },
    ],
    suggestedTests: [
      { testName: 'Patch testing', urgency: 'routine', rationale: 'Useful if allergic contact dermatitis remains in the differential.' },
    ],
  },
  {
    condition: 'Psoriasis',
    icd10Code: 'L40.9',
    threshold: 0.44,
    patterns: [
      { pattern: /\bpsoriasis\b/i, weight: 0.46, clue: 'psoriasis history' },
      { pattern: /\bthick\b|\bplaque\b|\bsilvery\b|\bscale\b/i, weight: 0.2, clue: 'plaque or scale language' },
      { pattern: /\bscalp\b|\belbows?\b|\bknees?\b/i, weight: 0.16, clue: 'classic psoriasis distribution' },
      { pattern: /\bjoint pain\b|\bstiff(?:ness)?\b/i, weight: 0.18, clue: 'possible psoriatic arthritis symptoms' },
    ],
    suggestedTests: [
      { testName: 'CBC / CMP baseline labs', urgency: 'routine', rationale: 'Useful before systemic or biologic therapy is started.' },
      { testName: 'TB screening and hepatitis panel', urgency: 'soon', rationale: 'Common baseline workup before biologic therapy if escalation is discussed.' },
      { testName: 'ESR / CRP', urgency: 'routine', rationale: 'Consider if joint pain or inflammatory symptoms are being described.' },
    ],
  },
  {
    condition: 'Acne vulgaris',
    icd10Code: 'L70.0',
    threshold: 0.42,
    patterns: [
      { pattern: /\bacne\b|\bbreakouts?\b|\bpimples?\b|\bcysts?\b|\bblackheads?\b/i, weight: 0.48, clue: 'acne breakout language' },
      { pattern: /\bface\b|\bchin\b|\bjaw\b|\bback\b|\bchest\b/i, weight: 0.14, clue: 'common acne distribution' },
      { pattern: /\bscarring\b|\bdeep\b|\bpainful\b/i, weight: 0.18, clue: 'moderate to severe acne features' },
      { pattern: /\baccutane\b|\bisotretinoin\b/i, weight: 0.24, clue: 'isotretinoin discussion' },
    ],
    suggestedTests: [
      { testName: 'Lipid panel', urgency: 'routine', rationale: 'Common baseline or monitoring lab when isotretinoin is being considered or used.' },
      { testName: 'Hepatic function panel', urgency: 'routine', rationale: 'Often monitored with isotretinoin or systemic acne therapy.' },
      { testName: 'Pregnancy test if applicable', urgency: 'urgent', rationale: 'Required before isotretinoin initiation when applicable.' },
    ],
  },
  {
    condition: 'Tinea corporis / fungal dermatitis',
    icd10Code: 'B35.4',
    threshold: 0.38,
    patterns: [
      { pattern: /\bringworm\b|\btinea\b|\bfungal\b/i, weight: 0.42, clue: 'fungal concern stated' },
      { pattern: /\bring-shaped\b|\bannular\b/i, weight: 0.22, clue: 'annular lesion language' },
      { pattern: /\bscale\b|\bitch(?:y|ing)?\b/i, weight: 0.14, clue: 'scale or itch' },
      { pattern: /\bgym\b|\blocker room\b|\bpet\b/i, weight: 0.14, clue: 'possible exposure history' },
    ],
    suggestedTests: [
      { testName: 'KOH prep', urgency: 'routine', rationale: 'Fast office test to support dermatophyte infection.' },
      { testName: 'Fungal culture', urgency: 'routine', rationale: 'Helpful when the diagnosis is uncertain or infection is persistent.' },
    ],
  },
  {
    condition: 'Rosacea',
    icd10Code: 'L71.9',
    threshold: 0.38,
    patterns: [
      { pattern: /\brosacea\b/i, weight: 0.48, clue: 'rosacea history' },
      { pattern: /\bflushing\b|\bface turns red\b|\bred face\b/i, weight: 0.22, clue: 'facial flushing/redness' },
      { pattern: /\btrigger\b|\bheat\b|\bspicy\b|\balcohol\b/i, weight: 0.14, clue: 'common rosacea triggers' },
      { pattern: /\bpustules?\b|\bpapules?\b/i, weight: 0.14, clue: 'papulopustular language' },
    ],
    suggestedTests: [
      { testName: 'No routine lab testing suggested from current transcript', urgency: 'routine', rationale: 'Rosacea is usually diagnosed clinically unless another inflammatory process is suspected.' },
    ],
  },
  {
    condition: 'Alopecia areata',
    icd10Code: 'L63.9',
    threshold: 0.4,
    patterns: [
      { pattern: /\balopecia areata\b/i, weight: 0.48, clue: 'alopecia areata history' },
      { pattern: /\bpatchy hair loss\b|\bround bald spots?\b/i, weight: 0.28, clue: 'patchy hair loss pattern' },
      { pattern: /\bhair loss\b|\bshedding\b/i, weight: 0.18, clue: 'hair loss symptoms' },
    ],
    suggestedTests: [
      { testName: 'TSH', urgency: 'routine', rationale: 'Reasonable screening when autoimmune-associated hair loss is being discussed.' },
      { testName: 'CBC / ferritin / iron studies', urgency: 'routine', rationale: 'Common baseline workup for hair loss complaints.' },
      { testName: 'Vitamin D', urgency: 'routine', rationale: 'Often considered in broader alopecia workup.' },
    ],
  },
  {
    condition: 'Telogen effluvium / diffuse shedding',
    icd10Code: 'L65.0',
    threshold: 0.38,
    patterns: [
      { pattern: /\bshedding\b|\bthinning hair\b|\bdiffuse hair loss\b/i, weight: 0.32, clue: 'diffuse shedding language' },
      { pattern: /\bstress\b|\billness\b|\bpostpartum\b|\bafter surgery\b/i, weight: 0.24, clue: 'triggering event history' },
      { pattern: /\bhair loss\b/i, weight: 0.18, clue: 'hair loss symptoms' },
    ],
    suggestedTests: [
      { testName: 'CBC', urgency: 'routine', rationale: 'Common screening lab in diffuse hair loss evaluation.' },
      { testName: 'Ferritin / iron studies', urgency: 'routine', rationale: 'Iron deficiency can contribute to shedding.' },
      { testName: 'TSH', urgency: 'routine', rationale: 'Thyroid disease can contribute to diffuse shedding.' },
      { testName: 'Vitamin D', urgency: 'routine', rationale: 'Often included in broader telogen effluvium workup.' },
    ],
  },
  {
    condition: 'Suspicious pigmented lesion / melanoma rule-out',
    icd10Code: 'D48.5',
    threshold: 0.42,
    patterns: [
      { pattern: /\bchanging mole\b|\bmole changing\b|\bnew mole\b/i, weight: 0.34, clue: 'changing mole concern' },
      { pattern: /\bbleed(?:ing)?\b|\bwon'?t heal\b/i, weight: 0.18, clue: 'bleeding or non-healing lesion' },
      { pattern: /\bdark\b|\bblack\b|\birregular\b|\basymmetric\b/i, weight: 0.2, clue: 'high-risk lesion descriptors' },
      { pattern: /\bgrowth\b|\blesion\b|\bspot\b/i, weight: 0.14, clue: 'concerning lesion language' },
    ],
    suggestedTests: [
      { testName: 'Skin biopsy', urgency: 'urgent', rationale: 'Needed when a changing or concerning lesion is being described.' },
      { testName: 'Dermoscopy / lesion photography', urgency: 'soon', rationale: 'Helpful for lesion comparison and pre-biopsy assessment.' },
      { testName: 'Pathology review', urgency: 'urgent', rationale: 'Required after biopsy to confirm diagnosis and next steps.' },
    ],
  },
  {
    condition: 'Basal cell carcinoma / squamous cell carcinoma rule-out',
    icd10Code: 'D48.5',
    threshold: 0.38,
    patterns: [
      { pattern: /\bwon'?t heal\b|\bbleed(?:ing)?\b|\bscab\b/i, weight: 0.32, clue: 'non-healing or bleeding lesion' },
      { pattern: /\brough spot\b|\bcrust(?:ing)?\b|\bgrowth\b/i, weight: 0.16, clue: 'growth or crusting language' },
      { pattern: /\bsun\b|\bactinic\b/i, weight: 0.12, clue: 'sun damage context' },
      { pattern: /\blesion\b|\bspot\b/i, weight: 0.1, clue: 'lesion terminology' },
    ],
    suggestedTests: [
      { testName: 'Skin biopsy', urgency: 'soon', rationale: 'Needed to distinguish non-healing lesions from skin cancer.' },
      { testName: 'Pathology review', urgency: 'soon', rationale: 'Required after biopsy for treatment planning.' },
    ],
  },
  {
    condition: 'Chronic urticaria / hives',
    icd10Code: 'L50.9',
    threshold: 0.38,
    patterns: [
      { pattern: /\bhives?\b|\burticaria\b|\bwelts?\b/i, weight: 0.5, clue: 'hives or welts' },
      { pattern: /\bitch(?:y|ing)?\b/i, weight: 0.14, clue: 'itching' },
      { pattern: /\bcomes and goes\b|\bepisodes?\b/i, weight: 0.14, clue: 'episodic pattern' },
    ],
    suggestedTests: [
      { testName: 'CBC / CMP', urgency: 'routine', rationale: 'Limited lab work may be reasonable if hives are chronic or systemic symptoms are present.' },
      { testName: 'TSH', urgency: 'routine', rationale: 'Consider in chronic urticaria workup when clinically appropriate.' },
    ],
  },
  {
    condition: 'Connective tissue disease / cutaneous lupus consideration',
    icd10Code: 'L93.0',
    threshold: 0.42,
    patterns: [
      { pattern: /\bphotosensitive\b|\bsun sensitive\b/i, weight: 0.22, clue: 'photosensitivity' },
      { pattern: /\bjoint pain\b|\bstiff(?:ness)?\b/i, weight: 0.18, clue: 'joint symptoms' },
      { pattern: /\bfatigue\b|\bfever\b/i, weight: 0.12, clue: 'systemic symptoms' },
      { pattern: /\bmalar\b|\bbutterfly rash\b|\blupus\b/i, weight: 0.34, clue: 'lupus-specific language' },
    ],
    suggestedTests: [
      { testName: 'ANA', urgency: 'soon', rationale: 'Reasonable when transcript suggests photosensitive rash with systemic symptoms.' },
      { testName: 'CBC / CMP', urgency: 'routine', rationale: 'Baseline lab review can help evaluate systemic involvement.' },
      { testName: 'Urinalysis', urgency: 'routine', rationale: 'Useful if connective tissue disease is being considered.' },
      { testName: 'Skin biopsy', urgency: 'soon', rationale: 'Helpful when morphology is concerning for autoimmune connective tissue disease.' },
    ],
  },
];

function normalizeTranscript(input: string | string[]): string {
  if (Array.isArray(input)) {
    return input.filter(Boolean).join(' ').trim();
  }
  return input.trim();
}

function confidenceFromWeight(weight: number, baseline = 0.52): number {
  return Math.max(0.35, Math.min(0.97, Number((baseline + weight * 0.4).toFixed(2))));
}

function extractEvidenceSnippet(transcript: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = transcript.match(pattern);
    if (!match || typeof match.index !== 'number') {
      continue;
    }

    const start = Math.max(0, match.index - 28);
    const end = Math.min(transcript.length, match.index + match[0].length + 36);
    return transcript.slice(start, end).trim().replace(/\s+/g, ' ');
  }

  return undefined;
}

function dedupeTests(tests: LiveSuggestedTestInsight[]): LiveSuggestedTestInsight[] {
  const byName = new Map<string, LiveSuggestedTestInsight>();
  const urgencyRank = { urgent: 3, soon: 2, routine: 1 };

  for (const test of tests) {
    const key = test.testName.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing || urgencyRank[test.urgency] > urgencyRank[existing.urgency]) {
      byName.set(key, test);
    }
  }

  return Array.from(byName.values()).slice(0, 6);
}

export function generateAmbientLiveInsights(input: string | string[]): AmbientLiveInsights {
  const transcript = normalizeTranscript(input);
  const normalized = transcript.toLowerCase();

  if (!transcript) {
    return {
      source: 'heuristic',
      updatedAt: new Date().toISOString(),
      symptoms: [],
      workingDiagnoses: [],
      suggestedTests: [],
    };
  }

  const symptoms = symptomRules
    .map((rule) => {
      const matches = rule.patterns.filter((pattern) => pattern.test(normalized));
      if (matches.length === 0) {
        return null;
      }

      return {
        label: rule.label,
        confidence: confidenceFromWeight(matches.length / Math.max(rule.patterns.length, 1), 0.58),
        evidence: extractEvidenceSnippet(transcript, rule.patterns),
      } satisfies LiveSymptomInsight;
    }) as Array<LiveSymptomInsight | null>;

  const filteredSymptoms = symptoms
    .filter((item): item is LiveSymptomInsight => item !== null)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);

  const workingDiagnoses = diagnosisRules
    .map((rule) => {
      const matches = rule.patterns.filter((patternRule) => patternRule.pattern.test(normalized));
      const score = matches.reduce((sum, item) => sum + item.weight, 0);
      if (score < rule.threshold) {
        return null;
      }

      const clues = matches.map((item) => item.clue).slice(0, 3);
      return {
        condition: rule.condition,
        icd10Code: rule.icd10Code,
        confidence: confidenceFromWeight(score, 0.42),
        reasoning: `Supported by ${clues.join(', ')} from the live conversation.`,
      } satisfies LiveDiagnosisInsight;
    }) as Array<LiveDiagnosisInsight | null>;

  const filteredDiagnoses = workingDiagnoses
    .filter((item): item is LiveDiagnosisInsight => item !== null)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 4);

  const suggestedTests = dedupeTests([
    ...diagnosisRules
      .filter((rule) => filteredDiagnoses.some((diagnosis) => diagnosis.condition === rule.condition))
      .flatMap((rule) => rule.suggestedTests),
    ...(/biologic|humira|skyrizi|cosentyx|dupixent/i.test(transcript)
      ? [
          { testName: 'CBC / CMP baseline labs', urgency: 'routine' as const, rationale: 'Common baseline evaluation before systemic or biologic therapy.' },
          { testName: 'TB screening and hepatitis panel', urgency: 'soon' as const, rationale: 'Often reviewed before starting biologic therapy.' },
        ]
      : []),
    ...(/isotretinoin|accutane/i.test(transcript)
      ? [
          { testName: 'Lipid panel', urgency: 'routine' as const, rationale: 'Common isotretinoin baseline or monitoring lab.' },
          { testName: 'Hepatic function panel', urgency: 'routine' as const, rationale: 'Often monitored with isotretinoin therapy.' },
          { testName: 'Pregnancy test if applicable', urgency: 'urgent' as const, rationale: 'Required before isotretinoin initiation when applicable.' },
        ]
      : []),
  ]);

  return {
    source: 'heuristic',
    updatedAt: new Date().toISOString(),
    symptoms: filteredSymptoms,
    workingDiagnoses: filteredDiagnoses,
    suggestedTests,
  };
}
