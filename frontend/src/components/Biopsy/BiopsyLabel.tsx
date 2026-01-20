import React, { useEffect, useState, useRef } from 'react';
import { Box, Typography, Paper, Divider, Grid } from '@mui/material';
import { format } from 'date-fns';
import Barcode from 'react-barcode';

interface BiopsyLabelProps {
  biopsyId: string;
  autoPrint?: boolean;
}

interface Biopsy {
  id: string;
  specimen_id: string;
  patient_name: string;
  mrn: string;
  date_of_birth: string;
  body_location: string;
  location_details: string;
  specimen_type: string;
  collected_at: string;
  ordering_provider_name: string;
  path_lab: string;
  special_instructions: string;
}

const BiopsyLabel: React.FC<BiopsyLabelProps> = ({ biopsyId, autoPrint = false }) => {
  const [biopsy, setBiopsy] = useState<Biopsy | null>(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchBiopsy();
  }, [biopsyId]);

  useEffect(() => {
    if (autoPrint && biopsy && !loading) {
      // Small delay to ensure rendering is complete
      setTimeout(() => {
        window.print();
      }, 500);
    }
  }, [autoPrint, biopsy, loading]);

  const fetchBiopsy = async () => {
    try {
      const response = await fetch(`/api/biopsies/${biopsyId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setBiopsy(data);
      }
    } catch (error) {
      console.error('Error fetching biopsy:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !biopsy) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography>Loading specimen label...</Typography>
      </Box>
    );
  }

  return (
    <Box
      ref={printRef}
      sx={{
        width: '4in',
        height: '3in',
        margin: '0 auto',
        p: 2,
        '@media print': {
          margin: 0,
          padding: '0.25in',
          pageBreakAfter: 'always'
        }
      }}
    >
      <Paper
        elevation={3}
        sx={{
          p: 2,
          height: '100%',
          border: '2px solid #000',
          '@media print': {
            border: '2px solid #000',
            boxShadow: 'none',
            backgroundColor: '#fff'
          }
        }}
      >
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 1 }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 'bold',
              fontSize: '14pt',
              borderBottom: '2px solid #000',
              pb: 0.5
            }}
          >
            SKIN BIOPSY SPECIMEN
          </Typography>
        </Box>

        {/* Specimen ID with Barcode */}
        <Box sx={{ textAlign: 'center', my: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 'bold', fontSize: '18pt' }}>
            {biopsy.specimen_id}
          </Typography>
          <Box sx={{ my: 0.5 }}>
            <Barcode
              value={biopsy.specimen_id}
              width={1.5}
              height={40}
              fontSize={10}
              displayValue={false}
            />
          </Box>
        </Box>

        <Divider sx={{ my: 1, borderWidth: 1, borderColor: '#000' }} />

        {/* Patient Information */}
        <Grid container spacing={0.5} sx={{ fontSize: '10pt' }}>
          <Grid item xs={12}>
            <Typography variant="body2" sx={{ fontWeight: 'bold', fontSize: '11pt' }}>
              Patient: {biopsy.patient_name}
            </Typography>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="body2" sx={{ fontSize: '9pt' }}>
              <strong>MRN:</strong> {biopsy.mrn}
            </Typography>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="body2" sx={{ fontSize: '9pt' }}>
              <strong>DOB:</strong> {format(new Date(biopsy.date_of_birth), 'MM/dd/yyyy')}
            </Typography>
          </Grid>

          <Grid item xs={12}>
            <Divider sx={{ my: 0.5 }} />
          </Grid>

          <Grid item xs={12}>
            <Typography variant="body2" sx={{ fontSize: '9pt' }}>
              <strong>Location:</strong> {biopsy.body_location}
            </Typography>
            {biopsy.location_details && (
              <Typography variant="body2" sx={{ fontSize: '8pt', ml: 1, color: '#666' }}>
                {biopsy.location_details}
              </Typography>
            )}
          </Grid>

          <Grid item xs={6}>
            <Typography variant="body2" sx={{ fontSize: '9pt' }}>
              <strong>Type:</strong> {biopsy.specimen_type}
            </Typography>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="body2" sx={{ fontSize: '9pt' }}>
              <strong>Date:</strong> {format(new Date(biopsy.collected_at || new Date()), 'MM/dd/yy')}
            </Typography>
          </Grid>

          <Grid item xs={12}>
            <Typography variant="body2" sx={{ fontSize: '9pt' }}>
              <strong>Provider:</strong> {biopsy.ordering_provider_name}
            </Typography>
          </Grid>

          <Grid item xs={12}>
            <Typography variant="body2" sx={{ fontSize: '9pt' }}>
              <strong>Lab:</strong> {biopsy.path_lab}
            </Typography>
          </Grid>

          {biopsy.special_instructions && (
            <>
              <Grid item xs={12}>
                <Divider sx={{ my: 0.5 }} />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2" sx={{ fontSize: '8pt', fontWeight: 'bold' }}>
                  SPECIAL INSTRUCTIONS:
                </Typography>
                <Typography variant="body2" sx={{ fontSize: '8pt', color: 'red' }}>
                  {biopsy.special_instructions}
                </Typography>
              </Grid>
            </>
          )}
        </Grid>

        {/* Footer */}
        <Box
          sx={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            right: 8,
            borderTop: '1px solid #ccc',
            pt: 0.5
          }}
        >
          <Typography variant="caption" sx={{ fontSize: '7pt', textAlign: 'center', display: 'block' }}>
            Handle with care - Formalin fixative - Keep upright
          </Typography>
        </Box>
      </Paper>

      {/* Print Instructions (hidden in print) */}
      <Box sx={{ mt: 2, textAlign: 'center', '@media print': { display: 'none' } }}>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Press Ctrl+P (Cmd+P on Mac) to print this label
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Recommended: Use adhesive label paper (4" x 3") or print on regular paper and affix to specimen container
        </Typography>
      </Box>

      {/* Print Styles */}
      <style>{`
        @media print {
          @page {
            size: 4in 3in;
            margin: 0;
          }

          body {
            margin: 0;
            padding: 0;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </Box>
  );
};

export default BiopsyLabel;
