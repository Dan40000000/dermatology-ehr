/**
 * Dermatopathology Report Parser
 * Parse and structure dermatopathology reports
 */

import { logger } from '../lib/logger';

interface ParsedDermPathReport {
  accessionNumber?: string;
  specimenSite?: string;
  specimenType?: string;
  specimenSize?: string;
  clinicalHistory?: string;
  clinicalDiagnosis?: string;
  grossDescription?: string;
  microscopicDescription?: string;
  diagnosis: string;
  specialStains?: Array<{ name: string; result: string }>;
  margins?: {
    status: string;
    measurements?: string;
  };
  comment?: string;
}

export class DermPathParser {
  /**
   * Parse a dermatopathology report from free text
   */
  static parseReport(reportText: string): ParsedDermPathReport {
    const sections = this.extractSections(reportText);

    return {
      accessionNumber: this.extractAccessionNumber(reportText),
      specimenSite: sections.specimenSite,
      specimenType: this.extractSpecimenType(sections.specimenInfo),
      specimenSize: this.extractSpecimenSize(sections.specimenInfo),
      clinicalHistory: sections.clinicalHistory,
      clinicalDiagnosis: sections.clinicalDiagnosis,
      grossDescription: sections.grossDescription,
      microscopicDescription: sections.microscopicDescription,
      diagnosis: sections.diagnosis || 'Not specified',
      specialStains: this.extractSpecialStains(reportText),
      margins: this.extractMargins(sections.diagnosis, sections.microscopicDescription),
      comment: sections.comment
    };
  }

  /**
   * Extract sections from report
   */
  private static extractSections(text: string): Record<string, string> {
    const sections: Record<string, string> = {};

    // Common section headers in dermatopathology reports
    const sectionPatterns = [
      { key: 'specimenInfo', pattern: /(?:SPECIMEN|SITE):\s*(.+?)(?:\n\n|(?=\n[A-Z]+:)|$)/is },
      { key: 'specimenSite', pattern: /(?:SITE|SPECIMEN SITE):\s*(.+?)(?:\n|$)/i },
      { key: 'clinicalHistory', pattern: /CLINICAL (?:HISTORY|INFORMATION):\s*(.+?)(?:\n\n|(?=\n[A-Z]+:)|$)/is },
      { key: 'clinicalDiagnosis', pattern: /CLINICAL DIAGNOSIS:\s*(.+?)(?:\n\n|(?=\n[A-Z]+:)|$)/is },
      { key: 'grossDescription', pattern: /GROSS (?:DESCRIPTION|EXAMINATION):\s*(.+?)(?:\n\n|(?=\n[A-Z]+:)|$)/is },
      { key: 'microscopicDescription', pattern: /MICROSCOPIC (?:DESCRIPTION|EXAMINATION):\s*(.+?)(?:\n\n|(?=\n[A-Z]+:)|$)/is },
      {
        key: 'diagnosis',
        pattern: /(?:^|\n)(?:DIAGNOSIS|PATHOLOGIC DIAGNOSIS):\s*(.+?)(?:\n\n|(?=\n(?:COMMENT|NOTE|SPECIAL STAINS):)|$)/is
      },
      { key: 'comment', pattern: /(?:COMMENT|NOTE):\s*(.+?)$/is }
    ];

    for (const { key, pattern } of sectionPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        sections[key] = match[1].trim();
      }
    }

    return sections;
  }

  /**
   * Extract accession number
   */
  private static extractAccessionNumber(text: string): string | undefined {
    const patterns = [
      /ACCESSION(?:\s+NUMBER)?:\s*([A-Z0-9-]+)/i,
      /ACC(?:ESSION)?#?\s*([A-Z0-9-]+)/i,
      /CASE(?:\s+NUMBER)?:\s*([A-Z0-9-]+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return undefined;
  }

  /**
   * Extract specimen type
   */
  private static extractSpecimenType(specimenInfo?: string): string | undefined {
    if (!specimenInfo) return undefined;

    const types = ['shave biopsy', 'punch biopsy', 'excision', 'incisional biopsy', 'excisional biopsy'];

    const lowerInfo = specimenInfo.toLowerCase();
    for (const type of types) {
      if (lowerInfo.includes(type)) {
        return type.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
    }

    return undefined;
  }

  /**
   * Extract specimen size
   */
  private static extractSpecimenSize(specimenInfo?: string): string | undefined {
    if (!specimenInfo) return undefined;

    // Match patterns like "0.5 x 0.3 x 0.2 cm" or "1.2 cm"
    const sizePattern = /(\d+\.?\d*\s*(?:x\s*\d+\.?\d*\s*){0,2}(?:cm|mm))/i;
    const match = specimenInfo.match(sizePattern);

    return match ? match[1] : undefined;
  }

  /**
   * Extract special stains
   */
  private static extractSpecialStains(text: string): Array<{ name: string; result: string }> | undefined {
    const stains: Array<{ name: string; result: string }> = [];

    // Look for special stains section
    const stainsSection = text.match(/SPECIAL STAINS?:\s*(.+?)(?:\n\n|$)/is);
    if (!stainsSection || !stainsSection[1]) return undefined;

    const stainsText = stainsSection[1];

    // Common dermatopathology stains
    const commonStains = [
      'PAS',
      'GMS',
      'AFB',
      'Gram',
      'Fontana-Masson',
      'Melan-A',
      'S100',
      'HMB-45',
      'MART-1',
      'Ki-67',
      'CD34',
      'CD31',
      'Factor XIIIa',
      'Alcian Blue'
    ];

    for (const stainName of commonStains) {
      const pattern = new RegExp(`${stainName}[:\\s-]+(positive|negative|pending|.*?)(?:\\.|\\n|$)`, 'i');
      const match = stainsText.match(pattern);
      if (match && match[1]) {
        stains.push({
          name: stainName,
          result: match[1].trim()
        });
      }
    }

    return stains.length > 0 ? stains : undefined;
  }

  /**
   * Extract margin status
   */
  private static extractMargins(diagnosis?: string, microscopic?: string): { status: string; measurements?: string } | undefined {
    const combinedText = `${diagnosis || ''} ${microscopic || ''}`.toLowerCase();

    if (!combinedText.includes('margin')) return undefined;

    let status = 'cannot_assess';

    if (combinedText.includes('margins are clear') || combinedText.includes('margins negative')) {
      status = 'clear';
    } else if (combinedText.includes('margins are involved') || combinedText.includes('margins positive')) {
      status = 'involved';
    } else if (combinedText.includes('close margin')) {
      status = 'close';
    }

    // Try to extract margin measurements
    const measurementPattern = /margin[s]?\s+(?:are\s+)?(?:clear\s+by\s+)?(\d+\.?\d*\s*(?:mm|cm))/i;
    const match = combinedText.match(measurementPattern);

    return {
      status,
      measurements: match ? match[1] : undefined
    };
  }

  /**
   * Generate structured diagnosis codes (SNOMED CT)
   */
  static suggestSNOMEDCode(diagnosis: string): string | null {
    // This is a simplified mapping. In production, use a proper SNOMED CT API or database
    const commonDiagnoses: Record<string, string> = {
      'basal cell carcinoma': '254701007',
      'squamous cell carcinoma': '402815007',
      'melanoma': '372244006',
      'seborrheic keratosis': '403835007',
      'dermatofibroma': '400099007',
      'actinic keratosis': '201101007',
      'psoriasis': '9014002',
      'eczema': '43116000',
      'lichen planus': '4776004',
      'granuloma annulare': '402596009'
    };

    const lowerDiagnosis = diagnosis.toLowerCase();

    for (const [key, code] of Object.entries(commonDiagnoses)) {
      if (lowerDiagnosis.includes(key)) {
        return code;
      }
    }

    return null;
  }

  /**
   * Extract key findings for structured storage
   */
  static extractKeyFindings(microscopicDescription?: string): string[] {
    if (!microscopicDescription) return [];

    const findings: string[] = [];
    const text = microscopicDescription.toLowerCase();

    // Common dermatopathology findings
    const findingPatterns = [
      'hyperkeratosis',
      'parakeratosis',
      'acanthosis',
      'spongiosis',
      'atypical melanocytes',
      'basal cell nests',
      'squamous cell islands',
      'keratin pearls',
      'lymphocytic infiltrate',
      'eosinophilic infiltrate',
      'plasma cells',
      'mitotic figures',
      'ulceration',
      'necrosis',
      'dysplasia'
    ];

    for (const pattern of findingPatterns) {
      if (text.includes(pattern)) {
        findings.push(pattern.charAt(0).toUpperCase() + pattern.slice(1));
      }
    }

    return findings;
  }

  /**
   * Generate plain language summary
   */
  static generateSummary(parsedReport: ParsedDermPathReport): string {
    const parts: string[] = [];

    if (parsedReport.specimenType && parsedReport.specimenSite) {
      parts.push(`${parsedReport.specimenType} from ${parsedReport.specimenSite}`);
    }

    parts.push(`showing ${parsedReport.diagnosis}`);

    if (parsedReport.margins) {
      if (parsedReport.margins.status === 'clear') {
        parts.push('with clear margins');
      } else if (parsedReport.margins.status === 'involved') {
        parts.push('with involved margins');
      }
    }

    return parts.join(' ') + '.';
  }
}
