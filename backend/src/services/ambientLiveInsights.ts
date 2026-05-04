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

export type LiveSpeakerRole = 'provider' | 'patient' | 'unknown';

export interface LiveVisitSummaryInsight {
  oneLiner: string;
  patientReported: string[];
  providerObserved: string[];
  planDraft: string[];
  documentationGaps: string[];
}

export interface LiveMedicationInsight {
  name: string;
  confidence: number;
  context: 'current' | 'recommended' | 'discussed';
  evidence?: string;
}

export interface LiveClinicalActionInsight {
  label: string;
  type: 'medication' | 'procedure' | 'lab' | 'follow_up' | 'education' | 'documentation';
  urgency: 'routine' | 'soon' | 'urgent';
  status: 'mentioned' | 'consider' | 'planned';
  rationale: string;
  evidence?: string;
}

export interface LiveSafetyFlagInsight {
  label: string;
  severity: 'watch' | 'soon' | 'urgent';
  rationale: string;
  evidence?: string;
}

export interface AmbientLiveInsights {
  source: 'heuristic' | 'openai';
  updatedAt: string;
  visitSummary: LiveVisitSummaryInsight;
  symptoms: LiveSymptomInsight[];
  workingDiagnoses: LiveDiagnosisInsight[];
  suggestedTests: LiveSuggestedTestInsight[];
  medications: LiveMedicationInsight[];
  clinicalActions: LiveClinicalActionInsight[];
  safetyFlags: LiveSafetyFlagInsight[];
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
  {
    label: 'Changing mole / pigmented lesion',
    patterns: [
      /\bchanging mole\b/i,
      /\bmole\b.{0,60}\bchang(?:ing|ed|es)\b/i,
      /\bchang(?:ing|ed|es)\b.{0,60}\bmole\b/i,
      /\bmole\b.{0,60}\b(darker|larger|bigger|growing|color|catch(?:es|ing|ed)?)\b/i,
      /\bpigmented lesion\b/i,
      /\birregular\b.{0,40}\b(mole|lesion|spot|papule)\b/i,
      /\b(mole|lesion|spot|papule)\b.{0,40}\birregular\b/i,
    ],
  },
  {
    label: 'Growth or color change',
    patterns: [/\bgrowing\b/i, /\b(larger|bigger|increased size)\b/i, /\b(darker|changed color|color change|multiple shades)\b/i],
  },
  {
    label: 'Bleeding / crusting',
    patterns: [/\bbleed(?:ing)?\b/i, /\bbled\b/i, /\bcrust(?:ing|ed)?\b/i, /\bscab(?:bed|bing)?\b/i],
  },
  {
    label: 'Irritated/catching lesion',
    patterns: [/\bcatch(?:es|ing)?\b/i, /\bgets caught\b/i, /\bclothing\b/i, /\bshirt\b/i, /\bscratch(?:ed|ing)?\b/i, /\birritated\b/i],
  },
  {
    label: 'Scalp itching/flaking',
    patterns: [/\bscalp\b.{0,60}\b(itch|flak|scale|dandruff)\b/i, /\b(itch|flak|scale|dandruff)\b.{0,60}\bscalp\b/i, /\bseborrheic\b/i],
  },
  { label: 'Itching / pruritus', patterns: [/\bitch(?:y|ing)?\b/i, /\bprurit/i] },
  { label: 'Rash / eruption', patterns: [/\brash\b/i, /\beruption\b/i, /\bspots?\b/i] },
  { label: 'Pain / tenderness', patterns: [/\bpain(?:ful)?\b/i, /\btender(?:ness)?\b/i, /\bsore\b/i, /\bburning\b/i] },
  { label: 'Redness / erythema', patterns: [/\bred(?:ness)?\b/i, /\berythema/i, /\bflushing\b/i] },
  { label: 'Scaling / flaking', patterns: [/\bscal(?:e|ing|y)\b/i, /\bflak(?:e|ing|y)\b/i, /\bdry\b/i] },
  { label: 'Drainage / oozing', patterns: [/\booz(?:e|ing)\b/i, /\bdrain(?:age)?\b/i, /\bdischarge\b/i, /\bpus\b/i] },
  { label: 'Hair loss / shedding', patterns: [/\bhair loss\b/i, /\bshedding\b/i, /\bthinning hair\b/i, /\balopecia\b/i] },
  { label: 'Hives / welts', patterns: [/\bhives?\b/i, /\bwelts?\b/i, /\burticaria\b/i] },
  { label: 'Joint pain / stiffness', patterns: [/\bjoint pain\b/i, /\bstiff(?:ness)?\b/i, /\bswollen joints?\b/i] },
  { label: 'Fatigue / systemic symptoms', patterns: [/\bfatigue\b/i, /\btired\b/i, /\bfever\b/i] },
];

const medicationRules: Array<{ name: string; patterns: RegExp[] }> = [
  { name: 'Triamcinolone', patterns: [/\btriamcinolone\b/i] },
  { name: 'Clobetasol', patterns: [/\bclobetasol\b/i] },
  { name: 'Hydrocortisone', patterns: [/\bhydrocortisone\b/i] },
  { name: 'Tacrolimus', patterns: [/\btacrolimus\b|\bprotopic\b/i] },
  { name: 'Mupirocin', patterns: [/\bmupirocin\b|\bbactroban\b/i] },
  { name: 'Ketoconazole', patterns: [/\bketoconazole\b|\bnizoral\b/i] },
  { name: 'Doxycycline', patterns: [/\bdoxycycline\b/i] },
  { name: 'Tretinoin', patterns: [/\btretinoin\b|\bretin-a\b/i] },
  { name: 'Isotretinoin', patterns: [/\bisotretinoin\b|\baccutane\b/i] },
  { name: 'Cetirizine', patterns: [/\bcetirizine\b|\bzyrtec\b/i] },
  { name: 'Diphenhydramine', patterns: [/\bdiphenhydramine\b|\bbenadryl\b/i] },
  { name: 'Dupixent', patterns: [/\bdupixent\b|\bdupilumab\b/i] },
  { name: 'Humira', patterns: [/\bhumira\b|\badalimumab\b/i] },
  { name: 'Skyrizi', patterns: [/\bskyrizi\b|\brisankizumab\b/i] },
  { name: 'Cosentyx', patterns: [/\bcosentyx\b|\bsecukinumab\b/i] },
  { name: 'Taltz', patterns: [/\btaltz\b|\bixekizumab\b/i] },
  { name: 'Tremfya', patterns: [/\btremfya\b|\bguselkumab\b/i] },
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
      { pattern: /\bchanging mole\b|\bmole changing\b|\bnew mole\b|\bmole\b.{0,60}\bchang(?:ing|ed|es)\b|\bchang(?:ing|ed|es)\b.{0,60}\bmole\b/i, weight: 0.34, clue: 'changing mole concern' },
      { pattern: /\bbleed(?:ing)?\b|\bwon'?t heal\b/i, weight: 0.18, clue: 'bleeding or non-healing lesion' },
      { pattern: /\bdark\b|\bblack\b|\birregular\b|\basymmetric\b|\bvariegated\b|\bborder\b/i, weight: 0.2, clue: 'high-risk lesion descriptors' },
      { pattern: /\bgrowth\b|\blesion\b|\bspot\b|\bmole\b/i, weight: 0.14, clue: 'concerning lesion language' },
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

function uniqueByText(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
}

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

function splitSentences(transcript: string): string[] {
  const matches = transcript
    .replace(/\s+/g, ' ')
    .match(/[^.!?\n]+[.!?]?/g);

  return (matches || [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function isNegatedOrSafetyNetSymptomSentence(sentence: string): boolean {
  const normalized = stripSpeakerPrefix(sentence).toLowerCase();
  const symptomWord = /\b(pain|hurt|tender|sore|itch|bleed|bled|crust|scab|drain|ooz|pus|discharge|fever|blister|rash|redness|swelling)\b/;

  if (/\b(denies?|denied|no|not|without|doesn'?t|does not|didn'?t|did not|isn'?t|is not)\b.{0,70}\b(pain|hurt|tender|sore|itch|bleed|bled|crust|scab|drain|ooz|pus|discharge|fever|blister|rash|redness|swelling)\b/i.test(normalized)) {
    return true;
  }

  if (/\b(pain|hurt|tender|sore|itch|bleed|bled|crust|scab|drain|ooz|pus|discharge|fever|blister|rash|redness|swelling)\b.{0,50}\b(absent|denied|none)\b/i.test(normalized)) {
    return true;
  }

  if (/\b(call|return|watch for|seek care|come back sooner|follow up sooner|if you (notice|develop|have)|if it (starts|gets|becomes)|warning signs|wound care|after (the )?(biopsy|procedure))\b/i.test(normalized) && symptomWord.test(normalized)) {
    return true;
  }

  if (/\b(any|do you have|have you had)\b.{0,55}\b(fever|pain|drainage|bleeding|itch|rash|pus|redness)\b\??/i.test(normalized)) {
    return true;
  }

  return false;
}

function stripSpeakerPrefix(text: string): string {
  return text
    .replace(/^\s*(doctor|provider|physician|clinician|dr\.?|patient|pt|nurse|ma)\s*:\s*/i, '')
    .trim();
}

function truncateText(text: string, maxLength = 180): string {
  const normalized = stripSpeakerPrefix(text).replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function findSentences(sentences: string[], patterns: RegExp[], limit: number): string[] {
  return uniqueByText(
    sentences
      .filter((sentence) => !isNegatedOrSafetyNetSymptomSentence(sentence) && patterns.some((pattern) => pattern.test(sentence)))
      .map((sentence) => truncateText(sentence)),
    limit
  );
}

function extractSupportedEvidenceSnippet(sentences: string[], patterns: RegExp[]): string | undefined {
  const sentence = sentences.find((candidate) =>
    !isNegatedOrSafetyNetSymptomSentence(candidate) && patterns.some((pattern) => pattern.test(candidate))
  );

  return sentence ? truncateText(sentence) : undefined;
}

export function inferLiveSpeakerRole(text: string): LiveSpeakerRole {
  const stripped = stripSpeakerPrefix(text);
  const normalized = stripped.toLowerCase();

  if (!normalized) {
    return 'unknown';
  }

  if (/^\s*(doctor|provider|physician|clinician|dr\.?|nurse|ma)\s*:/i.test(text)) {
    return 'provider';
  }

  if (/^\s*(patient|pt)\s*:/i.test(text)) {
    return 'patient';
  }

  if (/\b(patient reports|patient says|patient notes|patient describes|patient complains)\b/i.test(stripped)) {
    return 'patient';
  }

  if (/\b(i have|i've had|i am having|i'm having|my |i noticed|i tried|it started|it hurts|i feel|i get)\b/i.test(stripped)) {
    return 'patient';
  }

  if (/\b(exam shows|on exam|i can see|let me|we will|we'll|i recommend|recommend|prescribe|start|apply|biopsy|follow up|return in|call us|any fever|any joint|have you|do you|what brings)\b/i.test(stripped)) {
    return 'provider';
  }

  return 'unknown';
}

function extractPrimaryConcern(
  transcript: string,
  sentences: string[],
  symptoms: LiveSymptomInsight[]
): string {
  const patientSentences = sentences.filter((sentence) => inferLiveSpeakerRole(sentence) === 'patient');
  const symptomSentence = patientSentences.find((sentence) =>
    symptomRules.some((rule) => rule.patterns.some((pattern) => pattern.test(sentence)))
  );

  if (symptomSentence) {
    return truncateText(
      symptomSentence
        .replace(/\b(patient reports|patient says|patient notes|patient describes|patient complains that?)\b/i, '')
        .replace(/\b(i have|i've had|i am having|i'm having)\b/i, '')
    );
  }

  const firstSymptom = symptoms[0]?.label;
  if (firstSymptom) {
    return firstSymptom;
  }

  return transcript ? 'Clinical conversation in progress' : 'Waiting for conversation';
}

function buildDocumentationGaps(transcript: string): string[] {
  const gaps: string[] = [];

  if (!/\b(\d+\s*(day|week|month|year)s?|for\s+(about\s+)?(a|an|one|two|three|four|five|six|seven|eight|nine|ten)|x\s*\d+)/i.test(transcript)) {
    gaps.push('Confirm onset and duration.');
  }
  if (!/\b(face|scalp|arm|arms|hand|hands|leg|legs|trunk|back|chest|abdomen|neck|eyelid|groin|feet|foot|forearm|mole|lesion|spot)\b/i.test(transcript)) {
    gaps.push('Confirm lesion location and distribution.');
  }
  if (!/\b(mild|moderate|severe|worse|better|pain scale|\d+\/10)\b/i.test(transcript)) {
    gaps.push('Ask severity and whether symptoms are improving or worsening.');
  }
  if (!/\b(trigger|new soap|detergent|fragrance|sun|heat|stress|medication|outdoor|pet|gym|travel|exposure)\b/i.test(transcript)) {
    gaps.push('Ask about triggers, exposures, and new products.');
  }
  if (!/\b(tried|using|used|cream|ointment|antihistamine|steroid|antibiotic|treatment)\b/i.test(transcript)) {
    gaps.push('Document treatments already tried.');
  }
  if (!/\b(allergy|allergic|nkda|no known drug allergies)\b/i.test(transcript)) {
    gaps.push('Confirm medication allergies before prescribing.');
  }
  if (!/\b(exam shows|on exam|i can see|erythematous|papule|plaque|scale|crust|ulcer|nodule|macule|patch|dermoscopy)\b/i.test(transcript)) {
    gaps.push('Capture objective skin exam morphology.');
  }

  return gaps.slice(0, 5);
}

function inferMedicationContext(sentence: string): LiveMedicationInsight['context'] {
  if (/\b(start|prescribe|recommend|apply|take|use|continue)\b/i.test(sentence)) {
    return 'recommended';
  }
  if (/\b(taking|currently|already|tried|used)\b/i.test(sentence)) {
    return 'current';
  }
  return 'discussed';
}

function extractMedications(transcript: string, sentences: string[]): LiveMedicationInsight[] {
  const meds: LiveMedicationInsight[] = [];

  for (const medication of medicationRules) {
    const evidence = extractEvidenceSnippet(transcript, medication.patterns);
    if (!evidence) continue;

    const sentence = sentences.find((candidate) =>
      medication.patterns.some((pattern) => pattern.test(candidate))
    ) || evidence;

    meds.push({
      name: medication.name,
      confidence: 0.88,
      context: inferMedicationContext(sentence),
      evidence: truncateText(sentence),
    });
  }

  return meds.slice(0, 6);
}

function buildSafetyFlags(transcript: string): LiveSafetyFlagInsight[] {
  const flags: LiveSafetyFlagInsight[] = [];
  const pushFlag = (flag: LiveSafetyFlagInsight) => {
    if (flags.some((existing) => existing.label === flag.label)) return;
    flags.push(flag);
  };

  if (/\b(changing mole|mole changing|new mole|irregular|asymmetric|black|dark|bleeding|won'?t heal)\b/i.test(transcript)
    && /\b(mole|lesion|spot|growth)\b/i.test(transcript)) {
    pushFlag({
      label: 'Skin cancer warning features',
      severity: 'urgent',
      rationale: 'Changing, bleeding, non-healing, dark, or irregular lesions should be clinically reviewed and may need biopsy.',
      evidence: extractEvidenceSnippet(transcript, [/\b(changing mole|mole changing|new mole|irregular|asymmetric|black|dark|bleeding|won'?t heal)\b/i]),
    });
  }

  if (/\b(fever|pus|spreading redness|red streak|warm to touch|rapidly worse|severe pain)\b/i.test(transcript)) {
    pushFlag({
      label: 'Possible infection or urgent inflammatory flare',
      severity: 'urgent',
      rationale: 'Systemic symptoms, pus, rapidly spreading redness, or severe pain may require same-day escalation.',
      evidence: extractEvidenceSnippet(transcript, [/\b(fever|pus|spreading redness|red streak|warm to touch|rapidly worse|severe pain)\b/i]),
    });
  }

  if (/\b(isotretinoin|accutane)\b/i.test(transcript)) {
    pushFlag({
      label: 'Isotretinoin safety requirements',
      severity: 'urgent',
      rationale: 'Confirm pregnancy testing/iPLEDGE requirements when applicable plus baseline/monitoring labs.',
      evidence: extractEvidenceSnippet(transcript, [/\b(isotretinoin|accutane)\b/i]),
    });
  }

  if (/\b(biologic|humira|skyrizi|cosentyx|dupixent|taltz|tremfya|enbrel)\b/i.test(transcript)) {
    pushFlag({
      label: 'Systemic therapy safety screening',
      severity: 'soon',
      rationale: 'Biologic/systemic therapy discussions usually require infection risk screening and baseline lab review.',
      evidence: extractEvidenceSnippet(transcript, [/\b(biologic|humira|skyrizi|cosentyx|dupixent|taltz|tremfya|enbrel)\b/i]),
    });
  }

  if (/\b(psoriasis|plaque|plaques|biologic|humira|skyrizi|cosentyx|taltz|tremfya)\b/i.test(transcript)
    && /\b(joint pain|joint stiffness|stiffness|swollen joints?)\b/i.test(transcript)) {
    pushFlag({
      label: 'Possible psoriatic arthritis symptoms',
      severity: 'soon',
      rationale: 'Joint symptoms in psoriasis should be assessed because treatment choices and referrals may change.',
      evidence: extractEvidenceSnippet(transcript, [/\b(joint pain|stiffness|swollen joints?)\b/i]),
    });
  }

  if (/\b(photosensitive|sun sensitive|malar|butterfly rash|lupus)\b/i.test(transcript)
    && /\b(joint pain|fatigue|fever)\b/i.test(transcript)) {
    pushFlag({
      label: 'Systemic autoimmune features',
      severity: 'soon',
      rationale: 'Photosensitive rash with systemic symptoms can justify autoimmune review and lab consideration.',
      evidence: extractEvidenceSnippet(transcript, [/\b(photosensitive|sun sensitive|malar|butterfly rash|lupus|joint pain|fatigue|fever)\b/i]),
    });
  }

  return flags.slice(0, 5);
}

function buildClinicalActions(
  transcript: string,
  suggestedTests: LiveSuggestedTestInsight[],
  medications: LiveMedicationInsight[]
): LiveClinicalActionInsight[] {
  const actions: LiveClinicalActionInsight[] = [];
  const addAction = (action: LiveClinicalActionInsight) => {
    const key = `${action.type}:${action.label}`.toLowerCase();
    if (actions.some((existing) => `${existing.type}:${existing.label}`.toLowerCase() === key)) {
      return;
    }
    actions.push(action);
  };

  for (const medication of medications) {
    if (medication.context === 'recommended') {
      addAction({
        label: `Medication discussed: ${medication.name}`,
        type: 'medication',
        urgency: 'routine',
        status: 'planned',
        rationale: 'Medication was mentioned as part of the live treatment discussion.',
        evidence: medication.evidence,
      });
    }
  }

  for (const test of suggestedTests) {
    addAction({
      label: `Consider/order: ${test.testName}`,
      type: test.testName.toLowerCase().includes('biopsy') || test.testName.toLowerCase().includes('dermoscopy') ? 'procedure' : 'lab',
      urgency: test.urgency,
      status: 'consider',
      rationale: test.rationale,
    });
  }

  if (/\b(biopsy|shave|punch)\b/i.test(transcript)) {
    addAction({
      label: 'Prepare biopsy workflow',
      type: 'procedure',
      urgency: /\b(melanoma|changing|irregular|bleeding|black|dark)\b/i.test(transcript) ? 'urgent' : 'soon',
      status: 'planned',
      rationale: 'Biopsy language was captured in the conversation.',
      evidence: extractEvidenceSnippet(transcript, [/\b(biopsy|shave|punch)\b/i]),
    });
  }

  if (/\b(follow up|return in|recheck|come back)\b/i.test(transcript)) {
    addAction({
      label: 'Create follow-up reminder',
      type: 'follow_up',
      urgency: 'routine',
      status: 'planned',
      rationale: 'Follow-up timing was discussed and should be carried into the plan.',
      evidence: extractEvidenceSnippet(transcript, [/\b(follow up|return in|recheck|come back)[^.?!]*/i]),
    });
  }

  if (/\b(avoid|gentle|moisturizer|sunscreen|wound care|do not scratch|fragrance-free)\b/i.test(transcript)) {
    addAction({
      label: 'Capture patient education',
      type: 'education',
      urgency: 'routine',
      status: 'mentioned',
      rationale: 'Education or self-care instructions were stated during the visit.',
      evidence: extractEvidenceSnippet(transcript, [/\b(avoid|gentle|moisturizer|sunscreen|wound care|do not scratch|fragrance-free)[^.?!]*/i]),
    });
  }

  return actions.slice(0, 8);
}

function buildVisitSummary(
  transcript: string,
  sentences: string[],
  symptoms: LiveSymptomInsight[],
  diagnoses: LiveDiagnosisInsight[]
): LiveVisitSummaryInsight {
  const patientReported = findSentences(sentences, [
    /\b(patient reports|patient says|patient notes|patient describes|patient complains)\b/i,
    /\b(i have|i've had|i am having|i'm having|my |i noticed|i tried|it started|it hurts|i feel|i get)\b/i,
  ], 4);

  const providerObserved = findSentences(sentences, [
    /\b(exam shows|on exam|i can see|there (is|are)|erythematous|papule|plaque|scale|crust|ulcer|nodule|macule|patch|dermoscopy|distribution|morphology)\b/i,
  ], 4);

  const planDraft = findSentences(sentences, [
    /\b(recommend|start|prescribe|apply|take|use|continue|biopsy|culture|koh|labs?|follow up|return in|call|avoid|moisturizer|sunscreen)\b/i,
  ], 5);

  const concern = extractPrimaryConcern(transcript, sentences, symptoms).replace(/[.?!]+$/g, '');
  const topDiagnosis = diagnoses[0];
  const oneLiner = topDiagnosis
    ? `${concern} with ${topDiagnosis.condition} in the working differential.`
    : `${concern}. Live differential will update as more history and exam details are captured.`;

  return {
    oneLiner,
    patientReported,
    providerObserved,
    planDraft,
    documentationGaps: buildDocumentationGaps(transcript),
  };
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
      visitSummary: {
        oneLiner: 'Waiting for clinical conversation.',
        patientReported: [],
        providerObserved: [],
        planDraft: [],
        documentationGaps: [],
      },
      symptoms: [],
      workingDiagnoses: [],
      suggestedTests: [],
      medications: [],
      clinicalActions: [],
      safetyFlags: [],
    };
  }

  const sentences = splitSentences(transcript);

  const symptoms = symptomRules
    .map((rule) => {
      const matches = rule.patterns.filter((pattern) =>
        sentences.some((sentence) => !isNegatedOrSafetyNetSymptomSentence(sentence) && pattern.test(sentence))
      );
      if (matches.length === 0) {
        return null;
      }

      return {
        label: rule.label,
        confidence: confidenceFromWeight(matches.length / Math.max(rule.patterns.length, 1), 0.58),
        evidence: extractSupportedEvidenceSnippet(sentences, rule.patterns) || extractEvidenceSnippet(transcript, rule.patterns),
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
  const medications = extractMedications(transcript, sentences);
  const safetyFlags = buildSafetyFlags(transcript);
  const clinicalActions = buildClinicalActions(transcript, suggestedTests, medications);
  const visitSummary = buildVisitSummary(transcript, sentences, filteredSymptoms, filteredDiagnoses);

  return {
    source: 'heuristic',
    updatedAt: new Date().toISOString(),
    visitSummary,
    symptoms: filteredSymptoms,
    workingDiagnoses: filteredDiagnoses,
    suggestedTests,
    medications,
    clinicalActions,
    safetyFlags,
  };
}
