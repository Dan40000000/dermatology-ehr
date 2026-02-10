import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Tooltip,
  Badge,
  Chip,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import {
  Warning as WarningIcon,
  Visibility as ViewIcon
} from '@mui/icons-material';

interface TrackedLesion {
  id: string;
  patientId: string;
  bodyLocationCode: string;
  bodyLocationDescription: string;
  firstDocumented: string;
  status: 'active' | 'resolved' | 'excised';
  clinicalDescription: string | null;
  suspicionLevel: number;
}

interface LesionAlert {
  id: string;
  lesionId: string;
  alertType: string;
  severity: string;
}

interface BodyMapLesionsProps {
  lesions: TrackedLesion[];
  alerts: LesionAlert[];
  onSelectLesion: (lesion: TrackedLesion) => void;
}

// Body region definitions with approximate positions for front/back view
const bodyRegions: Record<string, { x: number; y: number; width: number; height: number; view: 'front' | 'back' | 'both' }> = {
  'HEAD': { x: 45, y: 2, width: 10, height: 10, view: 'both' },
  'FACE': { x: 45, y: 5, width: 10, height: 8, view: 'front' },
  'SCALP': { x: 45, y: 2, width: 10, height: 5, view: 'both' },
  'NECK': { x: 45, y: 12, width: 10, height: 5, view: 'both' },
  'CHEST': { x: 40, y: 18, width: 20, height: 15, view: 'front' },
  'ABDOMEN': { x: 40, y: 33, width: 20, height: 15, view: 'front' },
  'BACK-UPPER': { x: 40, y: 18, width: 20, height: 15, view: 'back' },
  'BACK-LOWER': { x: 40, y: 33, width: 20, height: 15, view: 'back' },
  'ARM-L-UPPER': { x: 20, y: 18, width: 10, height: 15, view: 'both' },
  'ARM-L-LOWER': { x: 15, y: 33, width: 10, height: 15, view: 'both' },
  'ARM-R-UPPER': { x: 70, y: 18, width: 10, height: 15, view: 'both' },
  'ARM-R-LOWER': { x: 75, y: 33, width: 10, height: 15, view: 'both' },
  'HAND-L': { x: 10, y: 48, width: 8, height: 8, view: 'both' },
  'HAND-R': { x: 82, y: 48, width: 8, height: 8, view: 'both' },
  'LEG-L-UPPER': { x: 35, y: 50, width: 12, height: 18, view: 'both' },
  'LEG-L-LOWER': { x: 33, y: 68, width: 10, height: 18, view: 'both' },
  'LEG-R-UPPER': { x: 53, y: 50, width: 12, height: 18, view: 'both' },
  'LEG-R-LOWER': { x: 57, y: 68, width: 10, height: 18, view: 'both' },
  'FOOT-L': { x: 30, y: 88, width: 10, height: 8, view: 'both' },
  'FOOT-R': { x: 60, y: 88, width: 10, height: 8, view: 'both' },
  'SHOULDER-L': { x: 28, y: 15, width: 8, height: 6, view: 'both' },
  'SHOULDER-R': { x: 64, y: 15, width: 8, height: 6, view: 'both' },
  'BUTTOCKS': { x: 40, y: 48, width: 20, height: 8, view: 'back' },
};

const BodyMapLesions: React.FC<BodyMapLesionsProps> = ({
  lesions,
  alerts,
  onSelectLesion
}) => {
  const [view, setView] = useState<'front' | 'back'>('front');
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);

  // Group lesions by body location code
  const lesionsByRegion: Record<string, TrackedLesion[]> = {};
  lesions.forEach(lesion => {
    // Extract base region from location code (e.g., "ARM-L-UPPER-MEDIAL" -> "ARM-L-UPPER")
    const baseCode = lesion.bodyLocationCode.split('-').slice(0, 3).join('-');
    const matchedRegion = Object.keys(bodyRegions).find(region =>
      lesion.bodyLocationCode.startsWith(region) || baseCode.startsWith(region)
    ) || 'OTHER';

    if (!lesionsByRegion[matchedRegion]) {
      lesionsByRegion[matchedRegion] = [];
    }
    lesionsByRegion[matchedRegion].push(lesion);
  });

  const getRegionColor = (regionCode: string): string => {
    const regionLesions = lesionsByRegion[regionCode] || [];
    if (regionLesions.length === 0) return 'transparent';

    const maxSuspicion = Math.max(...regionLesions.map(l => l.suspicionLevel));
    const hasAlert = regionLesions.some(l => alerts.some(a => a.lesionId === l.id));

    if (hasAlert || maxSuspicion >= 4) return 'rgba(211, 47, 47, 0.5)';
    if (maxSuspicion >= 3) return 'rgba(237, 108, 2, 0.5)';
    if (maxSuspicion >= 2) return 'rgba(255, 193, 7, 0.5)';
    return 'rgba(76, 175, 80, 0.5)';
  };

  const getLesionCount = (regionCode: string): number => {
    return (lesionsByRegion[regionCode] || []).length;
  };

  const getAlertCount = (regionCode: string): number => {
    const regionLesions = lesionsByRegion[regionCode] || [];
    return regionLesions.reduce((count, lesion) =>
      count + alerts.filter(a => a.lesionId === lesion.id).length, 0
    );
  };

  const renderRegion = (regionCode: string, region: typeof bodyRegions[string]) => {
    if (region.view !== 'both' && region.view !== view) return null;

    const lesionCount = getLesionCount(regionCode);
    const alertCount = getAlertCount(regionCode);
    const regionLesions = lesionsByRegion[regionCode] || [];

    if (lesionCount === 0) return null;

    return (
      <Tooltip
        key={regionCode}
        title={
          <Box>
            <Typography variant="subtitle2">{regionCode}</Typography>
            <Typography variant="body2">{lesionCount} lesion(s)</Typography>
            {alertCount > 0 && (
              <Typography variant="body2" color="warning.main">
                {alertCount} active alert(s)
              </Typography>
            )}
            <Box mt={1}>
              {regionLesions.slice(0, 3).map(l => (
                <Typography key={l.id} variant="caption" display="block">
                  - {l.bodyLocationDescription} (Level {l.suspicionLevel})
                </Typography>
              ))}
              {regionLesions.length > 3 && (
                <Typography variant="caption">
                  + {regionLesions.length - 3} more
                </Typography>
              )}
            </Box>
          </Box>
        }
        arrow
      >
        <Box
          onClick={() => {
            if (regionLesions.length === 1) {
              onSelectLesion(regionLesions[0]!);
            }
          }}
          onMouseEnter={() => setHoveredRegion(regionCode)}
          onMouseLeave={() => setHoveredRegion(null)}
          sx={{
            position: 'absolute',
            left: `${region.x}%`,
            top: `${region.y}%`,
            width: `${region.width}%`,
            height: `${region.height}%`,
            bgcolor: getRegionColor(regionCode),
            border: hoveredRegion === regionCode ? '2px solid #1976d2' : '1px solid rgba(0,0,0,0.2)',
            borderRadius: 1,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            '&:hover': {
              transform: 'scale(1.05)',
              zIndex: 10
            }
          }}
        >
          <Badge
            badgeContent={alertCount > 0 ? <WarningIcon sx={{ fontSize: 12 }} /> : null}
            color="warning"
          >
            <Chip
              label={lesionCount}
              size="small"
              sx={{
                bgcolor: 'background.paper',
                minWidth: 24,
                height: 24
              }}
            />
          </Badge>
        </Box>
      </Tooltip>
    );
  };

  return (
    <Box>
      {/* Controls */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={(_, newView) => newView && setView(newView)}
          size="small"
        >
          <ToggleButton value="front">Front View</ToggleButton>
          <ToggleButton value="back">Back View</ToggleButton>
        </ToggleButtonGroup>

        <Box display="flex" gap={1}>
          <Chip label={`${lesions.filter(l => l.suspicionLevel >= 4).length} High Risk`} color="error" size="small" />
          <Chip label={`${lesions.filter(l => l.suspicionLevel === 3).length} Moderate`} color="warning" size="small" />
          <Chip label={`${lesions.filter(l => l.suspicionLevel <= 2).length} Low Risk`} color="success" size="small" />
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Body Map */}
        <Grid item xs={12} md={6}>
          <Paper
            sx={{
              position: 'relative',
              height: 600,
              bgcolor: '#f5f5f5',
              backgroundImage: view === 'front'
                ? 'url(/assets/body-outline-front.svg)'
                : 'url(/assets/body-outline-back.svg)',
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center'
            }}
          >
            {/* Fallback body outline when no image */}
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '80%',
                height: '90%',
                border: '2px dashed #ccc',
                borderRadius: '50% 50% 0 0 / 20% 20% 0 0',
                opacity: 0.3
              }}
            />

            {/* Render lesion markers */}
            {Object.entries(bodyRegions).map(([code, region]) => renderRegion(code, region))}
          </Paper>
        </Grid>

        {/* Lesion List */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 600, overflow: 'auto' }}>
            <Typography variant="h6" gutterBottom>
              Lesions by Region ({view === 'front' ? 'Front' : 'Back'})
            </Typography>

            {Object.entries(lesionsByRegion)
              .filter(([regionCode]) => {
                const region = bodyRegions[regionCode];
                if (!region) return true;
                return region.view === 'both' || region.view === view;
              })
              .map(([regionCode, regionLesions]) => (
                <Box key={regionCode} mb={2}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {regionCode} ({regionLesions.length})
                  </Typography>
                  {regionLesions.map(lesion => (
                    <Paper
                      key={lesion.id}
                      variant="outlined"
                      sx={{
                        p: 1.5,
                        mb: 1,
                        cursor: 'pointer',
                        borderLeft: 4,
                        borderColor: lesion.suspicionLevel >= 4 ? 'error.main' :
                                    lesion.suspicionLevel >= 3 ? 'warning.main' : 'success.main',
                        '&:hover': {
                          bgcolor: 'action.hover'
                        }
                      }}
                      onClick={() => onSelectLesion(lesion)}
                    >
                      <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography variant="body2" fontWeight="medium">
                            {lesion.bodyLocationDescription}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Level {lesion.suspicionLevel} - {lesion.status}
                          </Typography>
                        </Box>
                        <Box display="flex" alignItems="center" gap={1}>
                          {alerts.some(a => a.lesionId === lesion.id) && (
                            <WarningIcon color="warning" fontSize="small" />
                          )}
                          <ViewIcon color="action" fontSize="small" />
                        </Box>
                      </Box>
                    </Paper>
                  ))}
                </Box>
              ))}

            {Object.keys(lesionsByRegion).length === 0 && (
              <Typography color="text.secondary" textAlign="center" mt={4}>
                No lesions to display
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Legend */}
      <Paper sx={{ p: 2, mt: 2 }}>
        <Typography variant="subtitle2" gutterBottom>Legend</Typography>
        <Box display="flex" gap={3} flexWrap="wrap">
          <Box display="flex" alignItems="center" gap={1}>
            <Box sx={{ width: 16, height: 16, bgcolor: 'rgba(211, 47, 47, 0.5)', borderRadius: 0.5 }} />
            <Typography variant="body2">High Risk / Alert</Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <Box sx={{ width: 16, height: 16, bgcolor: 'rgba(237, 108, 2, 0.5)', borderRadius: 0.5 }} />
            <Typography variant="body2">Moderate Risk</Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <Box sx={{ width: 16, height: 16, bgcolor: 'rgba(255, 193, 7, 0.5)', borderRadius: 0.5 }} />
            <Typography variant="body2">Low Risk</Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <Box sx={{ width: 16, height: 16, bgcolor: 'rgba(76, 175, 80, 0.5)', borderRadius: 0.5 }} />
            <Typography variant="body2">Minimal Risk</Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default BodyMapLesions;
