/**
 * BodyLocationPicker - Interactive body diagram for selecting procedure location
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  Tabs,
  Tab,
  Grid,
  Chip,
  InputAdornment
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

// ============================================
// TYPES
// ============================================

interface BodyLocation {
  code: string;
  name: string;
  category: string;
  icd10Code?: string;
  laterality?: string;
}

interface BodyLocationPickerProps {
  onSelect: (location: { code: string; name: string; laterality?: string }) => void;
  selectedLocation?: string;
}

// ============================================
// ANATOMICAL LOCATIONS DATA
// ============================================

const ANATOMICAL_LOCATIONS: BodyLocation[] = [
  // HEAD AND FACE
  { code: 'scalp', name: 'Scalp', category: 'Head & Face', icd10Code: 'C44.40' },
  { code: 'forehead', name: 'Forehead', category: 'Head & Face', icd10Code: 'C44.309' },
  { code: 'temple-right', name: 'Right Temple', category: 'Head & Face', icd10Code: 'C44.319', laterality: 'right' },
  { code: 'temple-left', name: 'Left Temple', category: 'Head & Face', icd10Code: 'C44.319', laterality: 'left' },
  { code: 'eyebrow-right', name: 'Right Eyebrow', category: 'Head & Face', icd10Code: 'C44.309', laterality: 'right' },
  { code: 'eyebrow-left', name: 'Left Eyebrow', category: 'Head & Face', icd10Code: 'C44.309', laterality: 'left' },
  { code: 'eyelid-upper-right', name: 'Right Upper Eyelid', category: 'Head & Face', icd10Code: 'C44.111', laterality: 'right' },
  { code: 'eyelid-upper-left', name: 'Left Upper Eyelid', category: 'Head & Face', icd10Code: 'C44.112', laterality: 'left' },
  { code: 'eyelid-lower-right', name: 'Right Lower Eyelid', category: 'Head & Face', icd10Code: 'C44.121', laterality: 'right' },
  { code: 'eyelid-lower-left', name: 'Left Lower Eyelid', category: 'Head & Face', icd10Code: 'C44.122', laterality: 'left' },
  { code: 'nose', name: 'Nose', category: 'Head & Face', icd10Code: 'C44.301' },
  { code: 'nose-tip', name: 'Nasal Tip', category: 'Head & Face', icd10Code: 'C44.301' },
  { code: 'nose-ala-right', name: 'Right Nasal Ala', category: 'Head & Face', icd10Code: 'C44.301', laterality: 'right' },
  { code: 'nose-ala-left', name: 'Left Nasal Ala', category: 'Head & Face', icd10Code: 'C44.301', laterality: 'left' },
  { code: 'cheek-right', name: 'Right Cheek', category: 'Head & Face', icd10Code: 'C44.319', laterality: 'right' },
  { code: 'cheek-left', name: 'Left Cheek', category: 'Head & Face', icd10Code: 'C44.319', laterality: 'left' },
  { code: 'ear-right', name: 'Right Ear', category: 'Head & Face', icd10Code: 'C44.20', laterality: 'right' },
  { code: 'ear-left', name: 'Left Ear', category: 'Head & Face', icd10Code: 'C44.20', laterality: 'left' },
  { code: 'lip-upper', name: 'Upper Lip', category: 'Head & Face', icd10Code: 'C44.00' },
  { code: 'lip-lower', name: 'Lower Lip', category: 'Head & Face', icd10Code: 'C44.01' },
  { code: 'chin', name: 'Chin', category: 'Head & Face', icd10Code: 'C44.319' },
  { code: 'jaw-right', name: 'Right Jaw', category: 'Head & Face', icd10Code: 'C44.319', laterality: 'right' },
  { code: 'jaw-left', name: 'Left Jaw', category: 'Head & Face', icd10Code: 'C44.319', laterality: 'left' },

  // NECK
  { code: 'neck-anterior', name: 'Anterior Neck', category: 'Neck', icd10Code: 'C44.40' },
  { code: 'neck-posterior', name: 'Posterior Neck', category: 'Neck', icd10Code: 'C44.40' },
  { code: 'neck-right', name: 'Right Neck', category: 'Neck', icd10Code: 'C44.40', laterality: 'right' },
  { code: 'neck-left', name: 'Left Neck', category: 'Neck', icd10Code: 'C44.40', laterality: 'left' },

  // TRUNK - CHEST
  { code: 'chest-anterior', name: 'Anterior Chest', category: 'Trunk', icd10Code: 'C44.509' },
  { code: 'chest-right', name: 'Right Chest', category: 'Trunk', icd10Code: 'C44.509', laterality: 'right' },
  { code: 'chest-left', name: 'Left Chest', category: 'Trunk', icd10Code: 'C44.509', laterality: 'left' },

  // TRUNK - BACK
  { code: 'back-upper', name: 'Upper Back', category: 'Trunk', icd10Code: 'C44.509' },
  { code: 'back-mid', name: 'Mid Back', category: 'Trunk', icd10Code: 'C44.509' },
  { code: 'back-lower', name: 'Lower Back', category: 'Trunk', icd10Code: 'C44.509' },
  { code: 'back-right', name: 'Right Back', category: 'Trunk', icd10Code: 'C44.509', laterality: 'right' },
  { code: 'back-left', name: 'Left Back', category: 'Trunk', icd10Code: 'C44.509', laterality: 'left' },

  // TRUNK - ABDOMEN
  { code: 'abdomen', name: 'Abdomen', category: 'Trunk', icd10Code: 'C44.509' },
  { code: 'abdomen-right', name: 'Right Abdomen', category: 'Trunk', icd10Code: 'C44.509', laterality: 'right' },
  { code: 'abdomen-left', name: 'Left Abdomen', category: 'Trunk', icd10Code: 'C44.509', laterality: 'left' },
  { code: 'flank-right', name: 'Right Flank', category: 'Trunk', icd10Code: 'C44.509', laterality: 'right' },
  { code: 'flank-left', name: 'Left Flank', category: 'Trunk', icd10Code: 'C44.509', laterality: 'left' },

  // UPPER EXTREMITY - SHOULDER
  { code: 'shoulder-right', name: 'Right Shoulder', category: 'Upper Extremity', icd10Code: 'C44.60', laterality: 'right' },
  { code: 'shoulder-left', name: 'Left Shoulder', category: 'Upper Extremity', icd10Code: 'C44.60', laterality: 'left' },

  // UPPER EXTREMITY - ARM
  { code: 'arm-upper-right', name: 'Right Upper Arm', category: 'Upper Extremity', icd10Code: 'C44.60', laterality: 'right' },
  { code: 'arm-upper-left', name: 'Left Upper Arm', category: 'Upper Extremity', icd10Code: 'C44.60', laterality: 'left' },
  { code: 'elbow-right', name: 'Right Elbow', category: 'Upper Extremity', icd10Code: 'C44.60', laterality: 'right' },
  { code: 'elbow-left', name: 'Left Elbow', category: 'Upper Extremity', icd10Code: 'C44.60', laterality: 'left' },
  { code: 'forearm-right', name: 'Right Forearm', category: 'Upper Extremity', icd10Code: 'C44.60', laterality: 'right' },
  { code: 'forearm-left', name: 'Left Forearm', category: 'Upper Extremity', icd10Code: 'C44.60', laterality: 'left' },

  // UPPER EXTREMITY - WRIST/HAND
  { code: 'wrist-right', name: 'Right Wrist', category: 'Upper Extremity', icd10Code: 'C44.60', laterality: 'right' },
  { code: 'wrist-left', name: 'Left Wrist', category: 'Upper Extremity', icd10Code: 'C44.60', laterality: 'left' },
  { code: 'hand-dorsal-right', name: 'Right Dorsal Hand', category: 'Upper Extremity', icd10Code: 'C44.60', laterality: 'right' },
  { code: 'hand-dorsal-left', name: 'Left Dorsal Hand', category: 'Upper Extremity', icd10Code: 'C44.60', laterality: 'left' },
  { code: 'hand-palmar-right', name: 'Right Palm', category: 'Upper Extremity', icd10Code: 'C44.60', laterality: 'right' },
  { code: 'hand-palmar-left', name: 'Left Palm', category: 'Upper Extremity', icd10Code: 'C44.60', laterality: 'left' },
  { code: 'finger-right', name: 'Right Finger', category: 'Upper Extremity', icd10Code: 'C44.60', laterality: 'right' },
  { code: 'finger-left', name: 'Left Finger', category: 'Upper Extremity', icd10Code: 'C44.60', laterality: 'left' },

  // LOWER EXTREMITY - THIGH
  { code: 'thigh-anterior-right', name: 'Right Anterior Thigh', category: 'Lower Extremity', icd10Code: 'C44.70', laterality: 'right' },
  { code: 'thigh-anterior-left', name: 'Left Anterior Thigh', category: 'Lower Extremity', icd10Code: 'C44.70', laterality: 'left' },
  { code: 'thigh-posterior-right', name: 'Right Posterior Thigh', category: 'Lower Extremity', icd10Code: 'C44.70', laterality: 'right' },
  { code: 'thigh-posterior-left', name: 'Left Posterior Thigh', category: 'Lower Extremity', icd10Code: 'C44.70', laterality: 'left' },

  // LOWER EXTREMITY - KNEE/LEG
  { code: 'knee-right', name: 'Right Knee', category: 'Lower Extremity', icd10Code: 'C44.70', laterality: 'right' },
  { code: 'knee-left', name: 'Left Knee', category: 'Lower Extremity', icd10Code: 'C44.70', laterality: 'left' },
  { code: 'shin-right', name: 'Right Shin', category: 'Lower Extremity', icd10Code: 'C44.70', laterality: 'right' },
  { code: 'shin-left', name: 'Left Shin', category: 'Lower Extremity', icd10Code: 'C44.70', laterality: 'left' },
  { code: 'calf-right', name: 'Right Calf', category: 'Lower Extremity', icd10Code: 'C44.70', laterality: 'right' },
  { code: 'calf-left', name: 'Left Calf', category: 'Lower Extremity', icd10Code: 'C44.70', laterality: 'left' },

  // LOWER EXTREMITY - ANKLE/FOOT
  { code: 'ankle-right', name: 'Right Ankle', category: 'Lower Extremity', icd10Code: 'C44.70', laterality: 'right' },
  { code: 'ankle-left', name: 'Left Ankle', category: 'Lower Extremity', icd10Code: 'C44.70', laterality: 'left' },
  { code: 'foot-dorsal-right', name: 'Right Dorsal Foot', category: 'Lower Extremity', icd10Code: 'C44.70', laterality: 'right' },
  { code: 'foot-dorsal-left', name: 'Left Dorsal Foot', category: 'Lower Extremity', icd10Code: 'C44.70', laterality: 'left' },
  { code: 'foot-plantar-right', name: 'Right Plantar Foot', category: 'Lower Extremity', icd10Code: 'C44.70', laterality: 'right' },
  { code: 'foot-plantar-left', name: 'Left Plantar Foot', category: 'Lower Extremity', icd10Code: 'C44.70', laterality: 'left' },
  { code: 'toe-right', name: 'Right Toe', category: 'Lower Extremity', icd10Code: 'C44.70', laterality: 'right' },
  { code: 'toe-left', name: 'Left Toe', category: 'Lower Extremity', icd10Code: 'C44.70', laterality: 'left' },

  // BUTTOCKS
  { code: 'buttock-right', name: 'Right Buttock', category: 'Trunk', icd10Code: 'C44.509', laterality: 'right' },
  { code: 'buttock-left', name: 'Left Buttock', category: 'Trunk', icd10Code: 'C44.509', laterality: 'left' }
];

const CATEGORIES = [
  'All',
  'Head & Face',
  'Neck',
  'Trunk',
  'Upper Extremity',
  'Lower Extremity'
];

// ============================================
// COMPONENT
// ============================================

export const BodyLocationPicker: React.FC<BodyLocationPickerProps> = ({
  onSelect,
  selectedLocation
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState(0);

  const filteredLocations = useMemo(() => {
    let locations = ANATOMICAL_LOCATIONS;

    // Filter by category
    if (activeCategory > 0) {
      const categoryName = CATEGORIES[activeCategory];
      locations = locations.filter(loc => loc.category === categoryName);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      locations = locations.filter(
        loc =>
          loc.name.toLowerCase().includes(term) ||
          loc.code.toLowerCase().includes(term) ||
          (loc.icd10Code && loc.icd10Code.toLowerCase().includes(term))
      );
    }

    return locations;
  }, [searchTerm, activeCategory]);

  const groupedLocations = useMemo(() => {
    const groups: Record<string, BodyLocation[]> = {};
    filteredLocations.forEach(loc => {
      if (!groups[loc.category]) {
        groups[loc.category] = [];
      }
      groups[loc.category].push(loc);
    });
    return groups;
  }, [filteredLocations]);

  const handleSelect = (location: BodyLocation) => {
    onSelect({
      code: location.code,
      name: location.name,
      laterality: location.laterality
    });
  };

  return (
    <Box>
      {/* Search */}
      <TextField
        fullWidth
        placeholder="Search locations..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          )
        }}
        sx={{ mb: 2 }}
      />

      {/* Category Tabs */}
      <Tabs
        value={activeCategory}
        onChange={(_, newValue) => setActiveCategory(newValue)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2 }}
      >
        {CATEGORIES.map((category, index) => (
          <Tab key={category} label={category} value={index} />
        ))}
      </Tabs>

      {/* Location List */}
      <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
        {activeCategory === 0 ? (
          // Show grouped by category when "All" is selected
          Object.entries(groupedLocations).map(([category, locations]) => (
            <Box key={category} sx={{ mb: 2 }}>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                sx={{ px: 2, py: 1, bgcolor: 'grey.100' }}
              >
                {category}
              </Typography>
              <List dense disablePadding>
                {locations.map(location => (
                  <ListItem key={location.code} disablePadding>
                    <ListItemButton
                      selected={selectedLocation === location.code}
                      onClick={() => handleSelect(location)}
                    >
                      <ListItemText
                        primary={location.name}
                        secondary={
                          <Box component="span" sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                            {location.laterality && (
                              <Chip
                                size="small"
                                label={location.laterality}
                                color={location.laterality === 'right' ? 'primary' : 'secondary'}
                                variant="outlined"
                              />
                            )}
                            {location.icd10Code && (
                              <Chip
                                size="small"
                                label={location.icd10Code}
                                variant="outlined"
                              />
                            )}
                          </Box>
                        }
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Box>
          ))
        ) : (
          // Show flat list for specific category
          <List dense>
            {filteredLocations.map(location => (
              <ListItem key={location.code} disablePadding>
                <ListItemButton
                  selected={selectedLocation === location.code}
                  onClick={() => handleSelect(location)}
                >
                  <ListItemText
                    primary={location.name}
                    secondary={
                      <Box component="span" sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                        {location.laterality && (
                          <Chip
                            size="small"
                            label={location.laterality}
                            color={location.laterality === 'right' ? 'primary' : 'secondary'}
                            variant="outlined"
                          />
                        )}
                        {location.icd10Code && (
                          <Chip
                            size="small"
                            label={location.icd10Code}
                            variant="outlined"
                          />
                        )}
                      </Box>
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}

        {filteredLocations.length === 0 && (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">
              No locations found matching "{searchTerm}"
            </Typography>
          </Box>
        )}
      </Box>

      {/* Quick Select for Common Locations */}
      <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary" gutterBottom display="block">
          Quick Select - Common Locations
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
          {['Forehead', 'Nose', 'Upper Back', 'Forearm', 'Shin'].map(name => {
            const location = ANATOMICAL_LOCATIONS.find(l => l.name.includes(name));
            if (!location) return null;
            return (
              <Chip
                key={location.code}
                label={location.name}
                onClick={() => handleSelect(location)}
                variant={selectedLocation === location.code ? 'filled' : 'outlined'}
                color={selectedLocation === location.code ? 'primary' : 'default'}
              />
            );
          })}
        </Box>
      </Box>
    </Box>
  );
};

export default BodyLocationPicker;
