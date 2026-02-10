/**
 * ReadingGrid Component
 * Grid for recording patch test readings for all allergens
 */

import React, { useState } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  TextField,
  IconButton,
  Tooltip,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Info as InfoIcon,
  Check as CheckIcon,
  Clear as ClearIcon,
  PhotoCamera as PhotoIcon,
} from '@mui/icons-material';
import ReadingScale, { ReadingValue, READING_DEFINITIONS, ReadingBadge } from './ReadingScale';

export interface AllergenResult {
  id: string;
  allergen_id: string;
  allergen_name: string;
  position_number: number;
  reading_48hr: ReadingValue;
  reading_48hr_notes?: string;
  reading_96hr: ReadingValue;
  reading_96hr_notes?: string;
  category?: string;
  concentration?: string;
  vehicle?: string;
  cross_reactors?: string[];
  common_sources?: string[];
  avoidance_instructions?: string;
}

interface ReadingGridProps {
  results: AllergenResult[];
  timepoint: '48hr' | '96hr';
  onReadingChange: (allergenId: string, reading: ReadingValue, notes?: string) => void;
  disabled?: boolean;
  showPreviousReading?: boolean;
}

const ReadingGrid: React.FC<ReadingGridProps> = ({
  results,
  timepoint,
  onReadingChange,
  disabled = false,
  showPreviousReading = false,
}) => {
  const [selectedAllergen, setSelectedAllergen] = useState<AllergenResult | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const currentReadingKey = timepoint === '48hr' ? 'reading_48hr' : 'reading_96hr';
  const previousReadingKey = timepoint === '96hr' ? 'reading_48hr' : null;
  const notesKey = timepoint === '48hr' ? 'reading_48hr_notes' : 'reading_96hr_notes';

  const handleReadingChange = (allergenId: string, reading: ReadingValue) => {
    onReadingChange(allergenId, reading, notes[allergenId]);
  };

  const handleNotesChange = (allergenId: string, noteText: string) => {
    setNotes((prev) => ({ ...prev, [allergenId]: noteText }));
  };

  const handleNotesBlur = (result: AllergenResult) => {
    const currentReading = result[currentReadingKey] as ReadingValue;
    if (currentReading && currentReading !== 'not_read') {
      onReadingChange(result.allergen_id, currentReading, notes[result.allergen_id]);
    }
  };

  const isPositiveReading = (reading: ReadingValue): boolean => {
    return ['weak_positive', 'strong_positive', 'extreme_positive'].includes(reading);
  };

  return (
    <Box>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">
          {timepoint === '48hr' ? '48-Hour Reading' : '96-Hour Reading'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {results.filter((r) => r[currentReadingKey] !== 'not_read').length} / {results.length}{' '}
            read
          </Typography>
          <Typography variant="body2" color="error">
            {results.filter((r) => isPositiveReading(r[currentReadingKey] as ReadingValue)).length}{' '}
            positive
          </Typography>
        </Box>
      </Box>

      <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 50 }}>#</TableCell>
              <TableCell>Allergen</TableCell>
              <TableCell sx={{ width: 100 }}>Category</TableCell>
              {showPreviousReading && previousReadingKey && (
                <TableCell sx={{ width: 100 }}>48hr</TableCell>
              )}
              <TableCell sx={{ minWidth: 300 }}>Reading</TableCell>
              <TableCell sx={{ width: 200 }}>Notes</TableCell>
              <TableCell sx={{ width: 50 }}>Info</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {results.map((result) => {
              const currentReading = result[currentReadingKey] as ReadingValue;
              const previousReading = previousReadingKey
                ? (result[previousReadingKey] as ReadingValue)
                : null;
              const existingNotes = result[notesKey] || notes[result.allergen_id] || '';

              return (
                <TableRow
                  key={result.id}
                  sx={{
                    bgcolor: isPositiveReading(currentReading) ? 'error.50' : undefined,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      {result.position_number}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {result.allergen_name}
                    </Typography>
                    {result.concentration && (
                      <Typography variant="caption" color="text.secondary">
                        {result.concentration} in {result.vehicle}
                      </Typography>
                    )}
                  </TableCell>

                  <TableCell>
                    <Chip label={result.category || 'Other'} size="small" variant="outlined" />
                  </TableCell>

                  {showPreviousReading && previousReading && (
                    <TableCell>
                      {previousReading !== 'not_read' && (
                        <ReadingBadge value={previousReading} size="small" />
                      )}
                    </TableCell>
                  )}

                  <TableCell>
                    <ReadingScale
                      value={currentReading}
                      onChange={(reading) => handleReadingChange(result.allergen_id, reading)}
                      disabled={disabled}
                      compact
                      showLabels={false}
                    />
                  </TableCell>

                  <TableCell>
                    <TextField
                      size="small"
                      placeholder="Notes..."
                      value={notes[result.allergen_id] ?? existingNotes}
                      onChange={(e) => handleNotesChange(result.allergen_id, e.target.value)}
                      onBlur={() => handleNotesBlur(result)}
                      disabled={disabled}
                      fullWidth
                      multiline
                      maxRows={2}
                    />
                  </TableCell>

                  <TableCell>
                    <Tooltip title="View allergen details">
                      <IconButton size="small" onClick={() => setSelectedAllergen(result)}>
                        <InfoIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Allergen Details Dialog */}
      <Dialog
        open={!!selectedAllergen}
        onClose={() => setSelectedAllergen(null)}
        maxWidth="sm"
        fullWidth
      >
        {selectedAllergen && (
          <>
            <DialogTitle>
              {selectedAllergen.allergen_name}
              {selectedAllergen.concentration && (
                <Typography variant="body2" color="text.secondary">
                  {selectedAllergen.concentration} in {selectedAllergen.vehicle}
                </Typography>
              )}
            </DialogTitle>
            <DialogContent dividers>
              {selectedAllergen.cross_reactors && selectedAllergen.cross_reactors.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Cross-Reactors
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {selectedAllergen.cross_reactors.map((cr) => (
                      <Chip key={cr} label={cr} size="small" variant="outlined" />
                    ))}
                  </Box>
                </Box>
              )}

              {selectedAllergen.common_sources && selectedAllergen.common_sources.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Common Sources
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {selectedAllergen.common_sources.map((source) => (
                      <Chip key={source} label={source} size="small" color="info" variant="outlined" />
                    ))}
                  </Box>
                </Box>
              )}

              {selectedAllergen.avoidance_instructions && (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Avoidance Instructions
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {selectedAllergen.avoidance_instructions}
                  </Typography>
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedAllergen(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default ReadingGrid;
