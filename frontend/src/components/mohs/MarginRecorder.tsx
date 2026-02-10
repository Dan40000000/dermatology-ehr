/**
 * MarginRecorder Component
 * Records margin status for each tissue block in a Mohs stage
 */

import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  IconButton,
  Chip,
  Divider,
  Alert
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon
} from '@mui/icons-material';

interface BlockMargin {
  block_label: string;
  position: string;
  position_degrees: number;
  margin_status: 'positive' | 'negative' | 'close' | 'indeterminate';
  deep_margin_status: 'positive' | 'negative' | 'close' | 'indeterminate';
  depth_mm: string;
  tumor_type_found: string;
  tumor_percentage: string;
  notes: string;
}

interface MarginRecorderProps {
  stageId: string;
  stageNumber: number;
  onSave: (margins: BlockMargin[]) => Promise<void>;
  onCancel?: () => void;
  initialBlocks?: Partial<BlockMargin>[];
}

const CLOCK_POSITIONS = [
  { label: '12 o\'clock', value: '12', degrees: 0 },
  { label: '1 o\'clock', value: '1', degrees: 30 },
  { label: '2 o\'clock', value: '2', degrees: 60 },
  { label: '3 o\'clock', value: '3', degrees: 90 },
  { label: '4 o\'clock', value: '4', degrees: 120 },
  { label: '5 o\'clock', value: '5', degrees: 150 },
  { label: '6 o\'clock', value: '6', degrees: 180 },
  { label: '7 o\'clock', value: '7', degrees: 210 },
  { label: '8 o\'clock', value: '8', degrees: 240 },
  { label: '9 o\'clock', value: '9', degrees: 270 },
  { label: '10 o\'clock', value: '10', degrees: 300 },
  { label: '11 o\'clock', value: '11', degrees: 330 }
];

const DEFAULT_BLOCK: BlockMargin = {
  block_label: '',
  position: '',
  position_degrees: 0,
  margin_status: 'negative',
  deep_margin_status: 'negative',
  depth_mm: '',
  tumor_type_found: '',
  tumor_percentage: '',
  notes: ''
};

const MarginRecorder: React.FC<MarginRecorderProps> = ({
  stageId,
  stageNumber,
  onSave,
  onCancel,
  initialBlocks = []
}) => {
  const [blocks, setBlocks] = useState<BlockMargin[]>(
    initialBlocks.length > 0
      ? initialBlocks.map((b) => ({ ...DEFAULT_BLOCK, ...b }))
      : [{ ...DEFAULT_BLOCK, block_label: 'A' }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addBlock = () => {
    const lastBlock = blocks[blocks.length - 1];
    const nextLabel = lastBlock
      ? String.fromCharCode(lastBlock.block_label.charCodeAt(0) + 1)
      : 'A';
    setBlocks([...blocks, { ...DEFAULT_BLOCK, block_label: nextLabel }]);
  };

  const removeBlock = (index: number) => {
    if (blocks.length > 1) {
      setBlocks(blocks.filter((_, i) => i !== index));
    }
  };

  const updateBlock = (index: number, field: keyof BlockMargin, value: string | number) => {
    const newBlocks = [...blocks];
    const block = newBlocks[index];
    if (block) {
      (block as Record<string, unknown>)[field] = value;

      // Auto-update degrees when position changes
      if (field === 'position') {
        const position = CLOCK_POSITIONS.find((p) => p.value === value);
        if (position) {
          block.position_degrees = position.degrees;
        }
      }

      setBlocks(newBlocks);
    }
  };

  const hasPositiveMargins = blocks.some(
    (b) => b.margin_status === 'positive' || b.deep_margin_status === 'positive'
  );

  const allClear = blocks.every(
    (b) => b.margin_status === 'negative' && b.deep_margin_status === 'negative'
  );

  const handleSave = async () => {
    // Validate
    const invalidBlocks = blocks.filter((b) => !b.block_label);
    if (invalidBlocks.length > 0) {
      setError('All blocks must have a label');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave(blocks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save margins');
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'positive':
        return 'error';
      case 'negative':
        return 'success';
      case 'close':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">
          Record Margins - Stage {stageNumber}
        </Typography>
        <Box>
          {allClear && (
            <Chip
              icon={<CheckCircleIcon />}
              label="ALL CLEAR"
              color="success"
              sx={{ mr: 1 }}
            />
          )}
          {hasPositiveMargins && (
            <Chip
              icon={<WarningIcon />}
              label="POSITIVE MARGINS"
              color="error"
              sx={{ mr: 1 }}
            />
          )}
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {blocks.map((block, index) => (
        <Box key={index}>
          <Paper variant="outlined" sx={{ p: 2, mb: 2, backgroundColor: '#fafafa' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="subtitle1" fontWeight="bold">
                Block {block.block_label || `#${index + 1}`}
              </Typography>
              {blocks.length > 1 && (
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => removeBlock(index)}
                >
                  <DeleteIcon />
                </IconButton>
              )}
            </Box>

            <Grid container spacing={2}>
              {/* Block Label */}
              <Grid item xs={12} sm={2}>
                <TextField
                  label="Label"
                  value={block.block_label}
                  onChange={(e) => updateBlock(index, 'block_label', e.target.value.toUpperCase())}
                  size="small"
                  fullWidth
                  inputProps={{ maxLength: 2 }}
                />
              </Grid>

              {/* Position */}
              <Grid item xs={12} sm={3}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Position</InputLabel>
                  <Select
                    value={block.position}
                    label="Position"
                    onChange={(e) => updateBlock(index, 'position', e.target.value)}
                  >
                    {CLOCK_POSITIONS.map((pos) => (
                      <MenuItem key={pos.value} value={pos.value}>
                        {pos.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Peripheral Margin Status */}
              <Grid item xs={12} sm={3}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Peripheral Margin</InputLabel>
                  <Select
                    value={block.margin_status}
                    label="Peripheral Margin"
                    onChange={(e) => updateBlock(index, 'margin_status', e.target.value)}
                  >
                    <MenuItem value="negative">
                      <Chip size="small" label="NEGATIVE" color="success" />
                    </MenuItem>
                    <MenuItem value="positive">
                      <Chip size="small" label="POSITIVE" color="error" />
                    </MenuItem>
                    <MenuItem value="close">
                      <Chip size="small" label="CLOSE" color="warning" />
                    </MenuItem>
                    <MenuItem value="indeterminate">
                      <Chip size="small" label="INDETERMINATE" />
                    </MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Deep Margin Status */}
              <Grid item xs={12} sm={3}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Deep Margin</InputLabel>
                  <Select
                    value={block.deep_margin_status}
                    label="Deep Margin"
                    onChange={(e) => updateBlock(index, 'deep_margin_status', e.target.value)}
                  >
                    <MenuItem value="negative">
                      <Chip size="small" label="NEGATIVE" color="success" />
                    </MenuItem>
                    <MenuItem value="positive">
                      <Chip size="small" label="POSITIVE" color="error" />
                    </MenuItem>
                    <MenuItem value="close">
                      <Chip size="small" label="CLOSE" color="warning" />
                    </MenuItem>
                    <MenuItem value="indeterminate">
                      <Chip size="small" label="INDETERMINATE" />
                    </MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Depth */}
              <Grid item xs={12} sm={2}>
                <TextField
                  label="Depth (mm)"
                  value={block.depth_mm}
                  onChange={(e) => updateBlock(index, 'depth_mm', e.target.value)}
                  size="small"
                  fullWidth
                  type="number"
                  inputProps={{ step: 0.1, min: 0 }}
                />
              </Grid>

              {/* Tumor Type if positive */}
              {(block.margin_status === 'positive' || block.deep_margin_status === 'positive') && (
                <>
                  <Grid item xs={12} sm={5}>
                    <TextField
                      label="Tumor Type Found"
                      value={block.tumor_type_found}
                      onChange={(e) => updateBlock(index, 'tumor_type_found', e.target.value)}
                      size="small"
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField
                      label="% Involvement"
                      value={block.tumor_percentage}
                      onChange={(e) => updateBlock(index, 'tumor_percentage', e.target.value)}
                      size="small"
                      fullWidth
                      type="number"
                      inputProps={{ min: 0, max: 100 }}
                    />
                  </Grid>
                </>
              )}

              {/* Notes */}
              <Grid item xs={12}>
                <TextField
                  label="Notes"
                  value={block.notes}
                  onChange={(e) => updateBlock(index, 'notes', e.target.value)}
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                />
              </Grid>
            </Grid>
          </Paper>
        </Box>
      ))}

      <Divider sx={{ my: 2 }} />

      {/* Actions */}
      <Box display="flex" justifyContent="space-between">
        <Button
          startIcon={<AddIcon />}
          onClick={addBlock}
          variant="outlined"
        >
          Add Block
        </Button>

        <Box display="flex" gap={1}>
          {onCancel && (
            <Button onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Margins'}
          </Button>
        </Box>
      </Box>

      {/* Summary */}
      <Box mt={3} p={2} sx={{ backgroundColor: '#f5f5f5', borderRadius: 1 }}>
        <Typography variant="subtitle2" gutterBottom>
          Summary
        </Typography>
        <Typography variant="body2">
          Total Blocks: {blocks.length}
        </Typography>
        <Typography variant="body2">
          Positive Peripheral: {blocks.filter((b) => b.margin_status === 'positive').length}
        </Typography>
        <Typography variant="body2">
          Positive Deep: {blocks.filter((b) => b.deep_margin_status === 'positive').length}
        </Typography>
        <Typography variant="body2" fontWeight="bold" color={allClear ? 'success.main' : 'error.main'}>
          Overall: {allClear ? 'CLEAR' : 'RESIDUAL TUMOR'}
        </Typography>
      </Box>
    </Paper>
  );
};

export default MarginRecorder;
