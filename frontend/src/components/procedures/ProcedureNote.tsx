/**
 * ProcedureNote - Generated procedure note preview component
 */

import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PrintIcon from '@mui/icons-material/Print';
import toast from 'react-hot-toast';

// ============================================
// TYPES
// ============================================

interface ProcedureNoteProps {
  note: string;
  showActions?: boolean;
  onCopy?: () => void;
  onPrint?: () => void;
}

// ============================================
// COMPONENT
// ============================================

export const ProcedureNote: React.FC<ProcedureNoteProps> = ({
  note,
  showActions = true,
  onCopy,
  onPrint
}) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(note);
      toast.success('Note copied to clipboard');
      onCopy?.();
    } catch (error) {
      toast.error('Failed to copy note');
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Procedure Note</title>
          <style>
            body {
              font-family: 'Courier New', Courier, monospace;
              padding: 20px;
              font-size: 12pt;
              line-height: 1.5;
            }
            pre {
              white-space: pre-wrap;
              word-wrap: break-word;
            }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <pre>${note}</pre>
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
      onPrint?.();
    }
  };

  // Parse the note to add formatting
  const formatNote = (noteText: string) => {
    const lines = noteText.split('\n');
    return lines.map((line, index) => {
      // Check if line is a header (all caps or ends with colon)
      const isHeader = /^[A-Z\s-]+:?\s*$/.test(line.trim()) ||
                       line.trim().endsWith(':');
      const isEmpty = line.trim() === '';

      if (isEmpty) {
        return <Box key={index} sx={{ height: 8 }} />;
      }

      if (isHeader) {
        return (
          <Typography
            key={index}
            variant="subtitle2"
            sx={{
              fontWeight: 'bold',
              color: 'primary.main',
              mt: index > 0 ? 2 : 0,
              mb: 0.5
            }}
          >
            {line}
          </Typography>
        );
      }

      return (
        <Typography
          key={index}
          variant="body2"
          sx={{
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.6
          }}
        >
          {line}
        </Typography>
      );
    });
  };

  if (!note) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">
          No procedure note generated yet. Save the procedure first, then generate a note.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Action Buttons */}
      {showActions && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 1,
            mb: 2
          }}
        >
          <Tooltip title="Copy to Clipboard">
            <IconButton onClick={handleCopy} size="small">
              <ContentCopyIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Print">
            <IconButton onClick={handlePrint} size="small">
              <PrintIcon />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* Note Content */}
      <Paper
        variant="outlined"
        sx={{
          p: 3,
          bgcolor: 'grey.50',
          maxHeight: 500,
          overflow: 'auto'
        }}
      >
        {formatNote(note)}
      </Paper>

      {/* Copy Button at Bottom */}
      {showActions && (
        <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            onClick={handleCopy}
          >
            Copy to Clipboard
          </Button>
          <Button
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={handlePrint}
          >
            Print Note
          </Button>
        </Box>
      )}
    </Box>
  );
};

// ============================================
// PROCEDURE NOTE TEMPLATE HELPER
// ============================================

export interface ProcedureNoteData {
  procedureType: string;
  date: string;
  provider: string;
  patient: string;
  location: string;
  laterality?: string;
  indication?: string;
  anesthesia?: {
    type: string;
    agent?: string;
    concentration?: string;
    withEpinephrine?: boolean;
    volume?: number;
  };
  procedure: Record<string, unknown>;
  hemostasis?: string;
  closure?: {
    type: string;
    sutureType?: string;
    sutureSize?: string;
    sutureCount?: number;
  };
  specimen?: {
    sent: boolean;
    container?: string;
    label?: string;
    pathologyLab?: string;
  };
  complications?: string[];
  instructions?: string;
}

export const generateProcedureNoteFromData = (data: ProcedureNoteData): string => {
  let note = '';

  // Header
  note += `PROCEDURE NOTE\n`;
  note += `Date: ${data.date}\n`;
  note += `Provider: ${data.provider}\n`;
  note += `Patient: ${data.patient}\n`;
  note += `Procedure: ${data.procedureType}\n\n`;

  // Location
  note += `LOCATION:\n`;
  note += `${data.location}`;
  if (data.laterality) {
    note += ` (${data.laterality})`;
  }
  note += '\n\n';

  // Indication
  if (data.indication) {
    note += `INDICATION:\n`;
    note += `${data.indication}\n\n`;
  }

  // Anesthesia
  if (data.anesthesia && data.anesthesia.type !== 'none') {
    note += `ANESTHESIA:\n`;
    if (data.anesthesia.type === 'local') {
      note += `Local anesthesia with ${data.anesthesia.agent || 'lidocaine'} ${data.anesthesia.concentration || '1%'}`;
      if (data.anesthesia.withEpinephrine) {
        note += ' with epinephrine';
      }
      if (data.anesthesia.volume) {
        note += ` (${data.anesthesia.volume} mL)`;
      }
      note += ' was injected.\n';
    } else {
      note += `${data.anesthesia.type} anesthesia was applied.\n`;
    }
    note += '\n';
  }

  // Procedure Details
  note += `PROCEDURE:\n`;
  Object.entries(data.procedure).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      note += `${formattedKey}: ${value}\n`;
    }
  });
  note += '\n';

  // Hemostasis
  if (data.hemostasis) {
    note += `HEMOSTASIS:\n`;
    note += `Hemostasis achieved with ${data.hemostasis}.\n\n`;
  }

  // Closure
  if (data.closure && data.closure.type !== 'none') {
    note += `CLOSURE:\n`;
    if (data.closure.type === 'simple' || data.closure.type === 'intermediate') {
      note += `Wound closed with ${data.closure.sutureCount || 1} `;
      note += `${data.closure.sutureSize || '4-0'} ${data.closure.sutureType || 'nylon'} suture(s). `;
      note += `Closure type: ${data.closure.type}.\n`;
    } else if (data.closure.type === 'steri_strips') {
      note += `Wound approximated with steri-strips.\n`;
    } else {
      note += `${data.closure.type} closure performed.\n`;
    }
    note += '\n';
  }

  // Specimen
  if (data.specimen?.sent) {
    note += `SPECIMEN:\n`;
    note += `Specimen sent to pathology`;
    if (data.specimen.container) {
      note += ` in ${data.specimen.container}`;
    }
    if (data.specimen.pathologyLab) {
      note += ` (${data.specimen.pathologyLab})`;
    }
    note += '.\n';
    if (data.specimen.label) {
      note += `Label: ${data.specimen.label}\n`;
    }
    note += '\n';
  }

  // Complications
  if (data.complications && data.complications.length > 0) {
    note += `COMPLICATIONS:\n`;
    note += data.complications.join(', ') + '\n\n';
  } else {
    note += `COMPLICATIONS: None\n\n`;
  }

  // Instructions
  if (data.instructions) {
    note += `PATIENT INSTRUCTIONS:\n`;
    note += data.instructions + '\n';
  }

  return note;
};

export default ProcedureNote;
