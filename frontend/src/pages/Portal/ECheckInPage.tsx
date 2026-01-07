import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
  Grid,
  Paper,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
} from '@mui/material';
import {
  CheckCircle as CheckIcon,
  Person as PersonIcon,
  CreditCard as InsuranceIcon,
  Assignment as FormIcon,
  Payment as PaymentIcon,
  CloudUpload as UploadIcon,
} from '@mui/icons-material';
import {
  startPortalCheckin,
  fetchPortalCheckinSession,
  updatePortalCheckinSession,
  uploadPortalInsuranceCard,
  fetchPortalRequiredConsents,
  signPortalConsent,
  type CheckinSession,
  type ConsentForm,
} from '../../portalApi';

interface ECheckInPageProps {
  tenantId: string;
  portalToken: string;
  appointmentId: string; // Passed from appointment confirmation/reminder
}

const steps = ['Verify Info', 'Insurance', 'Forms & Consent', 'Payment', 'Complete'];

export default function ECheckInPage({ tenantId, portalToken, appointmentId }: ECheckInPageProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<CheckinSession | null>(null);
  const [requiredConsents, setRequiredConsents] = useState<ConsentForm[]>([]);

  // Step 1: Demographics
  const [demographicsConfirmed, setDemographicsConfirmed] = useState(false);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');

  // Step 2: Insurance
  const [insuranceFrontImage, setInsuranceFrontImage] = useState<string | null>(null);
  const [insuranceBackImage, setInsuranceBackImage] = useState<string | null>(null);

  // Step 3: Consents
  const [signedConsents, setSignedConsents] = useState<Set<string>>(new Set());

  // Step 4: Payment
  const [copayAmount, setCopayAmount] = useState<number>(0);
  const [copayPaid, setCopayPaid] = useState(false);

  useEffect(() => {
    initializeCheckin();
  }, []);

  const initializeCheckin = async () => {
    try {
      setLoading(true);

      // Start check-in session
      const { sessionId: newSessionId } = await startPortalCheckin(tenantId, portalToken, {
        appointmentId,
        sessionType: 'mobile',
      });

      setSessionId(newSessionId);

      // Load session details
      const sessionData = await fetchPortalCheckinSession(tenantId, portalToken, newSessionId);
      setSession(sessionData);

      // Load required consents
      const consentsData = await fetchPortalRequiredConsents(tenantId, portalToken);
      setRequiredConsents(consentsData.requiredConsents);

      // Mock copay amount - would come from appointment/insurance
      setCopayAmount(25.00);
    } catch (err) {
      setError('Failed to initialize check-in');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      setError(null);

      // Update session based on current step
      if (activeStep === 0) {
        await updatePortalCheckinSession(tenantId, portalToken, sessionId, {
          demographicsConfirmed: true,
        });
      } else if (activeStep === 1) {
        await updatePortalCheckinSession(tenantId, portalToken, sessionId, {
          insuranceVerified: true,
        });
      } else if (activeStep === 2) {
        await updatePortalCheckinSession(tenantId, portalToken, sessionId, {
          formsCompleted: true,
        });
      } else if (activeStep === 3) {
        await updatePortalCheckinSession(tenantId, portalToken, sessionId, {
          copayCollected: true,
        });
      }

      setActiveStep((prev) => prev + 1);
    } catch (err) {
      setError('Failed to update check-in status');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      await updatePortalCheckinSession(tenantId, portalToken, sessionId, {
        complete: true,
      });
      setSuccess(true);
    } catch (err) {
      setError('Failed to complete check-in');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInsuranceUpload = async (front: File, back: File) => {
    if (!sessionId) return;

    try {
      setLoading(true);

      // Convert files to base64 or upload to server
      // This is simplified - in real implementation, use proper file upload
      const frontUrl = URL.createObjectURL(front);
      const backUrl = URL.createObjectURL(back);

      setInsuranceFrontImage(frontUrl);
      setInsuranceBackImage(backUrl);

      await uploadPortalInsuranceCard(tenantId, portalToken, sessionId, {
        frontImageUrl: frontUrl,
        backImageUrl: backUrl,
      });
    } catch (err) {
      setError('Failed to upload insurance card');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSignConsent = async (consentId: string) => {
    try {
      setLoading(true);

      // In real implementation, capture actual signature
      const mockSignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      await signPortalConsent(tenantId, portalToken, consentId, {
        signatureData: mockSignature,
        signerName: 'Patient Name', // Would come from patient data
        signerRelationship: 'self',
      });

      setSignedConsents((prev) => new Set([...prev, consentId]));
    } catch (err) {
      setError('Failed to sign consent');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Container maxWidth="md" sx={{ py: 8 }}>
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <CheckIcon sx={{ fontSize: 80, color: 'success.main', mb: 2 }} />
          <Typography variant="h4" gutterBottom>
            Check-In Complete!
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            You are all checked in for your appointment. Please have a seat and you will be called shortly.
          </Typography>
          <Alert severity="info" sx={{ mt: 4 }}>
            Estimated wait time: 10-15 minutes
          </Alert>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Check-In
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Complete the following steps to check in for your appointment.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Step 0: Verify Demographics */}
      {activeStep === 0 && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <PersonIcon sx={{ mr: 2, fontSize: 40, color: 'primary.main' }} />
              <Typography variant="h5">Verify Your Information</Typography>
            </Box>
            <Divider sx={{ mb: 3 }} />
            <Typography variant="body2" color="text.secondary" paragraph>
              Please review and update your contact information if needed.
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main St, City, State 12345"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Phone Number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Emergency Contact"
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(e.target.value)}
                  placeholder="Name and phone"
                />
              </Grid>
            </Grid>
            <Box sx={{ mt: 3 }}>
              <Checkbox
                checked={demographicsConfirmed}
                onChange={(e) => setDemographicsConfirmed(e.target.checked)}
              />
              <Typography component="span">
                I confirm that the information above is correct
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Insurance Verification */}
      {activeStep === 1 && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <InsuranceIcon sx={{ mr: 2, fontSize: 40, color: 'primary.main' }} />
              <Typography variant="h5">Insurance Card</Typography>
            </Box>
            <Divider sx={{ mb: 3 }} />
            <Typography variant="body2" color="text.secondary" paragraph>
              Please upload photos of the front and back of your insurance card.
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3, textAlign: 'center', border: '2px dashed', borderColor: 'divider' }}>
                  <UploadIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
                  <Typography variant="body2" gutterBottom>
                    Front of Card
                  </Typography>
                  <Button
                    variant="outlined"
                    component="label"
                  >
                    Upload Photo
                    <input
                      type="file"
                      hidden
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file && insuranceBackImage) {
                          // Mock - would upload both
                        }
                      }}
                    />
                  </Button>
                  {insuranceFrontImage && (
                    <CheckIcon sx={{ color: 'success.main', mt: 2 }} />
                  )}
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3, textAlign: 'center', border: '2px dashed', borderColor: 'divider' }}>
                  <UploadIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
                  <Typography variant="body2" gutterBottom>
                    Back of Card
                  </Typography>
                  <Button
                    variant="outlined"
                    component="label"
                  >
                    Upload Photo
                    <input
                      type="file"
                      hidden
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file && insuranceFrontImage) {
                          // Mock - would upload both
                        }
                      }}
                    />
                  </Button>
                  {insuranceBackImage && (
                    <CheckIcon sx={{ color: 'success.main', mt: 2 }} />
                  )}
                </Paper>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Forms & Consents */}
      {activeStep === 2 && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <FormIcon sx={{ mr: 2, fontSize: 40, color: 'primary.main' }} />
              <Typography variant="h5">Required Consents</Typography>
            </Box>
            <Divider sx={{ mb: 3 }} />
            <Typography variant="body2" color="text.secondary" paragraph>
              Please review and sign the following consent forms.
            </Typography>
            <List>
              {requiredConsents.map((consent) => (
                <ListItem key={consent.id}>
                  <ListItemIcon>
                    {signedConsents.has(consent.id) ? (
                      <CheckIcon color="success" />
                    ) : (
                      <FormIcon />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={consent.title}
                    secondary={consent.consentType}
                  />
                  {!signedConsents.has(consent.id) && (
                    <Button
                      variant="outlined"
                      onClick={() => handleSignConsent(consent.id)}
                      disabled={loading}
                    >
                      Sign
                    </Button>
                  )}
                </ListItem>
              ))}
            </List>
            {requiredConsents.length === 0 && (
              <Alert severity="info">No consent forms required</Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Payment */}
      {activeStep === 3 && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <PaymentIcon sx={{ mr: 2, fontSize: 40, color: 'primary.main' }} />
              <Typography variant="h5">Copay</Typography>
            </Box>
            <Divider sx={{ mb: 3 }} />
            <Typography variant="body2" color="text.secondary" paragraph>
              Your estimated copay for today's visit:
            </Typography>
            <Paper sx={{ p: 3, bgcolor: 'primary.main', color: 'white', textAlign: 'center', mb: 3 }}>
              <Typography variant="h3">
                ${copayAmount.toFixed(2)}
              </Typography>
            </Paper>
            <Alert severity="info" sx={{ mb: 2 }}>
              You can pay now or at checkout
            </Alert>
            <Button
              fullWidth
              variant="contained"
              onClick={() => setCopayPaid(true)}
              disabled={copayPaid}
            >
              {copayPaid ? 'Payment Received' : 'Pay Now'}
            </Button>
            <Button
              fullWidth
              variant="text"
              onClick={() => setActiveStep((prev) => prev + 1)}
              sx={{ mt: 1 }}
            >
              Pay at Checkout
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Complete */}
      {activeStep === 4 && (
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>
              Review Your Check-In
            </Typography>
            <Divider sx={{ my: 2 }} />
            <List>
              <ListItem>
                <ListItemIcon>
                  <CheckIcon color="success" />
                </ListItemIcon>
                <ListItemText primary="Demographics verified" />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <CheckIcon color="success" />
                </ListItemIcon>
                <ListItemText primary="Insurance card uploaded" />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <CheckIcon color="success" />
                </ListItemIcon>
                <ListItemText
                  primary="Consent forms signed"
                  secondary={`${signedConsents.size} of ${requiredConsents.length} forms signed`}
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <CheckIcon color="success" />
                </ListItemIcon>
                <ListItemText
                  primary={copayPaid ? 'Copay paid' : 'Will pay at checkout'}
                />
              </ListItem>
            </List>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
        <Button
          disabled={activeStep === 0}
          onClick={() => setActiveStep((prev) => prev - 1)}
        >
          Back
        </Button>
        {activeStep < 4 ? (
          <Button
            variant="contained"
            onClick={handleNext}
            disabled={
              loading ||
              (activeStep === 0 && !demographicsConfirmed) ||
              (activeStep === 2 && requiredConsents.length > 0 && signedConsents.size < requiredConsents.length)
            }
          >
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={handleComplete}
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : 'Complete Check-In'}
          </Button>
        )}
      </Box>
    </Container>
  );
}
