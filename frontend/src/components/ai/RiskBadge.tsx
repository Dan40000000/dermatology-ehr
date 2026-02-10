import React from 'react';
import { Chip, Tooltip, Box, Typography } from '@mui/material';
import {
  CheckCircle as LowRiskIcon,
  Warning as ModerateRiskIcon,
  Error as HighRiskIcon,
} from '@mui/icons-material';

interface RiskBadgeProps {
  riskLevel: 'low' | 'moderate' | 'high';
  size?: 'small' | 'medium';
  showTooltip?: boolean;
  showIcon?: boolean;
}

const RiskBadge: React.FC<RiskBadgeProps> = ({
  riskLevel,
  size = 'small',
  showTooltip = true,
  showIcon = true,
}) => {
  const getRiskConfig = () => {
    switch (riskLevel) {
      case 'low':
        return {
          color: 'success' as const,
          icon: <LowRiskIcon />,
          label: 'Low Risk',
          tooltip: 'Low risk assessment - routine monitoring recommended',
          description: 'Features suggest benign lesion with low likelihood of malignancy.',
        };
      case 'moderate':
        return {
          color: 'warning' as const,
          icon: <ModerateRiskIcon />,
          label: 'Moderate Risk',
          tooltip: 'Moderate risk - closer evaluation recommended',
          description:
            'Some concerning features present. Consider dermoscopy and possible biopsy.',
        };
      case 'high':
        return {
          color: 'error' as const,
          icon: <HighRiskIcon />,
          label: 'High Risk',
          tooltip: 'High risk - immediate clinical evaluation required',
          description:
            'Multiple concerning features detected. Biopsy strongly recommended. Do not delay evaluation.',
        };
      default:
        return {
          color: 'default' as const,
          icon: null,
          label: 'Unknown',
          tooltip: 'Risk level not determined',
          description: 'Risk assessment not available.',
        };
    }
  };

  const config = getRiskConfig();

  const badge = (
    <Chip
      label={config.label}
      color={config.color}
      size={size}
      icon={showIcon ? config.icon : undefined}
      sx={{
        fontWeight: 'bold',
        ...(riskLevel === 'high' && {
          animation: 'pulse 2s infinite',
          '@keyframes pulse': {
            '0%': { boxShadow: '0 0 0 0 rgba(211, 47, 47, 0.4)' },
            '70%': { boxShadow: '0 0 0 10px rgba(211, 47, 47, 0)' },
            '100%': { boxShadow: '0 0 0 0 rgba(211, 47, 47, 0)' },
          },
        }),
      }}
    />
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <Tooltip
      title={
        <Box sx={{ p: 0.5 }}>
          <Typography variant="subtitle2">{config.tooltip}</Typography>
          <Typography variant="caption">{config.description}</Typography>
        </Box>
      }
      arrow
    >
      {badge}
    </Tooltip>
  );
};

export default RiskBadge;
