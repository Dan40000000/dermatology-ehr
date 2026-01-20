import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type RegistrationStep = 'verify' | 'create' | 'success';

interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
}

const passwordRequirements: PasswordRequirement[] = [
  { label: 'At least 12 characters', test: (p) => p.length >= 12 },
  { label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'One number', test: (p) => /[0-9]/.test(p) },
  { label: 'One special character (!@#$%^&*)', test: (p) => /[^a-zA-Z0-9]/.test(p) },
];

export function PortalRegisterPage() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<RegistrationStep>('verify');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Verification fields
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [ssnLast4, setSsnLast4] = useState('');

  // Account creation fields
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Verified patient info
  const [verifiedPatient, setVerifiedPatient] = useState<{
    firstName: string;
    lastName: string;
    patientEmail?: string;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/patient-portal/verify-identity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'tenant-demo',
        },
        body: JSON.stringify({
          lastName,
          dob,
          ssnLast4,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      setVerifiedPatient({
        firstName: data.firstName,
        lastName: data.lastName,
        patientEmail: data.email,
      });

      // Pre-fill email if patient has one on file
      if (data.email) {
        setEmail(data.email);
        setConfirmEmail(data.email);
      }

      setStep('create');
    } catch (err: any) {
      setError(err.message || 'Unable to verify your identity. Please check your information or contact the office.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAccount = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate emails match
    if (email !== confirmEmail) {
      setError('Email addresses do not match');
      return;
    }

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate all password requirements
    const failedRequirements = passwordRequirements.filter(req => !req.test(password));
    if (failedRequirements.length > 0) {
      setError('Password does not meet all requirements');
      return;
    }

    if (!acceptTerms) {
      setError('Please accept the terms and conditions');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/patient-portal/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'tenant-demo',
        },
        body: JSON.stringify({
          firstName: verifiedPatient?.firstName,
          lastName,
          dob,
          ssnLast4,
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getPasswordStrength = () => {
    const passed = passwordRequirements.filter(req => req.test(password)).length;
    if (passed === 0) return { strength: 0, label: '', color: '#e5e7eb' };
    if (passed <= 2) return { strength: 1, label: 'Weak', color: '#ef4444' };
    if (passed <= 3) return { strength: 2, label: 'Fair', color: '#f59e0b' };
    if (passed <= 4) return { strength: 3, label: 'Good', color: '#10b981' };
    return { strength: 4, label: 'Strong', color: '#059669' };
  };

  const passwordStrength = getPasswordStrength();

  return (
    <div className={`portal-register-page ${mounted ? 'mounted' : ''}`}>
      {/* Animated Background */}
      <div className="portal-bg">
        <div className="portal-bg-gradient"></div>
        <div className="portal-bg-pattern"></div>
        <div className="portal-bg-glow glow-1"></div>
        <div className="portal-bg-glow glow-2"></div>
        <div className="portal-bg-glow glow-3"></div>
      </div>

      {/* Content */}
      <div className="portal-register-container">
        {/* Left Side - Branding */}
        <div className="portal-branding">
          <div className="branding-content">
            <div className="brand-logo">
              <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="24" cy="24" r="20" fill="white" fillOpacity="0.15"/>
                <path d="M24 8C15.164 8 8 15.164 8 24s7.164 16 16 16 16-7.164 16-16S32.836 8 24 8zm0 28c-6.627 0-12-5.373-12-12S17.373 12 24 12s12 5.373 12 12-5.373 12-12 12z" fill="white" fillOpacity="0.3"/>
                <path d="M24 14c-5.523 0-10 4.477-10 10s4.477 10 10 10 10-4.477 10-10-4.477-10-10-10zm0 16c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z" fill="white"/>
                <circle cx="24" cy="24" r="3" fill="white"/>
              </svg>
            </div>
            <h1>Mountain Pine<br/>Dermatology</h1>
            <p className="brand-tagline">Your health, your way</p>

            <div className="registration-steps">
              <div className={`step-item ${step === 'verify' ? 'active' : step === 'create' || step === 'success' ? 'completed' : ''}`}>
                <div className="step-number">
                  {step === 'create' || step === 'success' ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20,6 9,17 4,12"/>
                    </svg>
                  ) : '1'}
                </div>
                <div className="step-info">
                  <h3>Verify Identity</h3>
                  <p>Confirm you're a patient</p>
                </div>
              </div>
              <div className="step-connector"></div>
              <div className={`step-item ${step === 'create' ? 'active' : step === 'success' ? 'completed' : ''}`}>
                <div className="step-number">
                  {step === 'success' ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20,6 9,17 4,12"/>
                    </svg>
                  ) : '2'}
                </div>
                <div className="step-info">
                  <h3>Create Account</h3>
                  <p>Set up your login</p>
                </div>
              </div>
              <div className="step-connector"></div>
              <div className={`step-item ${step === 'success' ? 'active completed' : ''}`}>
                <div className="step-number">
                  {step === 'success' ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20,6 9,17 4,12"/>
                    </svg>
                  ) : '3'}
                </div>
                <div className="step-info">
                  <h3>Get Started</h3>
                  <p>Access your portal</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Registration Form */}
        <div className="portal-register-card">
          <div className="register-card-inner">
            {/* Step 1: Verify Identity */}
            {step === 'verify' && (
              <>
                <div className="portal-register-header">
                  <div className="header-badge">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                    <span>Secure Verification</span>
                  </div>
                  <h2>Let's verify your identity</h2>
                  <p>Please enter the information below to confirm you're an existing patient</p>
                </div>

                {error && (
                  <div className="portal-register-error">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleVerify} className="portal-register-form">
                  <div className={`form-field ${focusedField === 'lastName' ? 'focused' : ''} ${lastName ? 'has-value' : ''}`}>
                    <label htmlFor="lastName">Last Name</label>
                    <div className="input-wrapper">
                      <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                      <input
                        id="lastName"
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        onFocus={() => setFocusedField('lastName')}
                        onBlur={() => setFocusedField(null)}
                        required
                        placeholder="Enter your last name"
                        autoComplete="family-name"
                      />
                    </div>
                  </div>

                  <div className={`form-field ${focusedField === 'dob' ? 'focused' : ''} ${dob ? 'has-value' : ''}`}>
                    <label htmlFor="dob">Date of Birth</label>
                    <div className="input-wrapper">
                      <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      <input
                        id="dob"
                        type="date"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        onFocus={() => setFocusedField('dob')}
                        onBlur={() => setFocusedField(null)}
                        required
                        max={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                  </div>

                  <div className={`form-field ${focusedField === 'ssn' ? 'focused' : ''} ${ssnLast4 ? 'has-value' : ''}`}>
                    <label htmlFor="ssnLast4">Last 4 digits of Social Security Number</label>
                    <div className="input-wrapper">
                      <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                      <input
                        id="ssnLast4"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{4}"
                        maxLength={4}
                        value={ssnLast4}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                          setSsnLast4(value);
                        }}
                        onFocus={() => setFocusedField('ssn')}
                        onBlur={() => setFocusedField(null)}
                        required
                        placeholder="••••"
                        autoComplete="off"
                      />
                      <div className="ssn-mask">
                        {'•'.repeat(4 - ssnLast4.length)}
                      </div>
                    </div>
                    <p className="field-hint">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="16" x2="12" y2="12"/>
                        <line x1="12" y1="8" x2="12.01" y2="8"/>
                      </svg>
                      Your SSN is used only for identity verification and is protected with bank-level encryption
                    </p>
                  </div>

                  <button type="submit" disabled={isLoading} className="portal-submit-btn">
                    {isLoading ? (
                      <>
                        <span className="btn-spinner"></span>
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <span>Verify Identity</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="5" y1="12" x2="19" y2="12"/>
                          <polyline points="12,5 19,12 12,19"/>
                        </svg>
                      </>
                    )}
                  </button>
                </form>

                <div className="portal-divider">
                  <span>Already have an account?</span>
                </div>

                <Link to="/portal/login" className="portal-login-link">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10,17 15,12 10,7"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                  </svg>
                  <span>Sign In Instead</span>
                </Link>
              </>
            )}

            {/* Step 2: Create Account */}
            {step === 'create' && verifiedPatient && (
              <>
                <div className="portal-register-header">
                  <div className="header-badge success">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22,4 12,14.01 9,11.01"/>
                    </svg>
                    <span>Identity Verified</span>
                  </div>
                  <h2>Welcome, {verifiedPatient.firstName}!</h2>
                  <p>Create your login credentials to access the patient portal</p>
                </div>

                {error && (
                  <div className="portal-register-error">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleCreateAccount} className="portal-register-form">
                  <div className={`form-field ${focusedField === 'email' ? 'focused' : ''} ${email ? 'has-value' : ''}`}>
                    <label htmlFor="email">Email Address</label>
                    <div className="input-wrapper">
                      <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onFocus={() => setFocusedField('email')}
                        onBlur={() => setFocusedField(null)}
                        required
                        placeholder="Enter your email"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className={`form-field ${focusedField === 'confirmEmail' ? 'focused' : ''} ${confirmEmail ? 'has-value' : ''}`}>
                    <label htmlFor="confirmEmail">Confirm Email Address</label>
                    <div className="input-wrapper">
                      <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                      <input
                        id="confirmEmail"
                        type="email"
                        value={confirmEmail}
                        onChange={(e) => setConfirmEmail(e.target.value)}
                        onFocus={() => setFocusedField('confirmEmail')}
                        onBlur={() => setFocusedField(null)}
                        required
                        placeholder="Confirm your email"
                        autoComplete="email"
                      />
                      {confirmEmail && email && (
                        <div className={`match-indicator ${email === confirmEmail ? 'match' : 'no-match'}`}>
                          {email === confirmEmail ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20,6 9,17 4,12"/>
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18"/>
                              <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={`form-field ${focusedField === 'password' ? 'focused' : ''} ${password ? 'has-value' : ''}`}>
                    <label htmlFor="password">Password</label>
                    <div className="input-wrapper">
                      <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onFocus={() => setFocusedField('password')}
                        onBlur={() => setFocusedField(null)}
                        required
                        placeholder="Create a strong password"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="toggle-password"
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* Password Strength Indicator */}
                    {password && (
                      <div className="password-strength">
                        <div className="strength-bar">
                          {[1, 2, 3, 4].map((level) => (
                            <div
                              key={level}
                              className={`strength-segment ${passwordStrength.strength >= level ? 'filled' : ''}`}
                              style={{ backgroundColor: passwordStrength.strength >= level ? passwordStrength.color : undefined }}
                            />
                          ))}
                        </div>
                        <span className="strength-label" style={{ color: passwordStrength.color }}>
                          {passwordStrength.label}
                        </span>
                      </div>
                    )}

                    {/* Password Requirements */}
                    <div className="password-requirements">
                      {passwordRequirements.map((req, index) => (
                        <div
                          key={index}
                          className={`requirement ${req.test(password) ? 'met' : ''}`}
                        >
                          {req.test(password) ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20,6 9,17 4,12"/>
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10"/>
                            </svg>
                          )}
                          <span>{req.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={`form-field ${focusedField === 'confirmPassword' ? 'focused' : ''} ${confirmPassword ? 'has-value' : ''}`}>
                    <label htmlFor="confirmPassword">Confirm Password</label>
                    <div className="input-wrapper">
                      <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                      <input
                        id="confirmPassword"
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        onFocus={() => setFocusedField('confirmPassword')}
                        onBlur={() => setFocusedField(null)}
                        required
                        placeholder="Confirm your password"
                        autoComplete="new-password"
                      />
                      {confirmPassword && password && (
                        <div className={`match-indicator ${password === confirmPassword ? 'match' : 'no-match'}`}>
                          {password === confirmPassword ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20,6 9,17 4,12"/>
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18"/>
                              <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="terms-checkbox">
                    <label className="custom-checkbox">
                      <input
                        type="checkbox"
                        checked={acceptTerms}
                        onChange={(e) => setAcceptTerms(e.target.checked)}
                      />
                      <span className="checkmark"></span>
                      <span className="checkbox-label">
                        I accept the <a href="#terms" onClick={(e) => e.preventDefault()}>Terms of Service</a> and <a href="#privacy" onClick={(e) => e.preventDefault()}>Privacy Policy</a>
                      </span>
                    </label>
                  </div>

                  <div className="form-buttons">
                    <button type="button" className="back-btn" onClick={() => setStep('verify')}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="19" y1="12" x2="5" y2="12"/>
                        <polyline points="12,19 5,12 12,5"/>
                      </svg>
                      Back
                    </button>
                    <button type="submit" disabled={isLoading} className="portal-submit-btn">
                      {isLoading ? (
                        <>
                          <span className="btn-spinner"></span>
                          <span>Creating Account...</span>
                        </>
                      ) : (
                        <>
                          <span>Create Account</span>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="5" y1="12" x2="19" y2="12"/>
                            <polyline points="12,5 19,12 12,19"/>
                          </svg>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* Step 3: Success */}
            {step === 'success' && (
              <div className="success-container">
                <div className="success-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22,4 12,14.01 9,11.01"/>
                  </svg>
                </div>
                <h2>Account Created Successfully!</h2>
                <p>Your patient portal account has been created. Please check your email to verify your account before signing in.</p>

                <div className="success-info">
                  <div className="info-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    <span>Verification email sent to <strong>{email}</strong></span>
                  </div>
                  <div className="info-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12,6 12,12 16,14"/>
                    </svg>
                    <span>Link expires in 24 hours</span>
                  </div>
                </div>

                <button onClick={() => navigate('/portal/login')} className="portal-submit-btn">
                  <span>Go to Sign In</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12,5 19,12 12,19"/>
                  </svg>
                </button>

                <p className="resend-text">
                  Didn't receive the email? <button className="resend-link">Resend verification email</button>
                </p>
              </div>
            )}

            <div className="portal-security-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <polyline points="9,12 11,14 15,10"/>
              </svg>
              <span>256-bit SSL encrypted connection</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="portal-register-footer">
        <p>&copy; 2026 Mountain Pine Dermatology &bull; <a href="#privacy">Privacy Policy</a> &bull; <a href="#terms">Terms of Service</a></p>
      </footer>

      <style>{`
        .portal-register-page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }

        /* Animated Background */
        .portal-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
        }

        .portal-bg-gradient {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%);
        }

        .portal-bg-pattern {
          position: absolute;
          inset: 0;
          opacity: 0.03;
          background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
        }

        .portal-bg-glow {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          animation: float 20s ease-in-out infinite;
        }

        .glow-1 {
          width: 600px;
          height: 600px;
          background: rgba(99, 102, 241, 0.15);
          top: -200px;
          right: -100px;
          animation-delay: 0s;
        }

        .glow-2 {
          width: 500px;
          height: 500px;
          background: rgba(139, 92, 246, 0.12);
          bottom: -150px;
          left: -100px;
          animation-delay: -7s;
        }

        .glow-3 {
          width: 400px;
          height: 400px;
          background: rgba(59, 130, 246, 0.1);
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          animation-delay: -14s;
        }

        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(30px, -30px) scale(1.05); }
          50% { transform: translate(-20px, 20px) scale(0.95); }
          75% { transform: translate(20px, 30px) scale(1.02); }
        }

        /* Content Container */
        .portal-register-container {
          flex: 1;
          display: flex;
          position: relative;
          z-index: 1;
          padding: 2rem;
          gap: 4rem;
          max-width: 1400px;
          margin: 0 auto;
          width: 100%;
          align-items: center;
        }

        /* Branding Side */
        .portal-branding {
          flex: 1;
          display: flex;
          align-items: center;
          padding: 2rem;
          opacity: 0;
          transform: translateX(-30px);
          transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .portal-register-page.mounted .portal-branding {
          opacity: 1;
          transform: translateX(0);
        }

        .branding-content {
          color: white;
          max-width: 500px;
        }

        .brand-logo {
          width: 80px;
          height: 80px;
          margin-bottom: 2rem;
        }

        .brand-logo svg {
          width: 100%;
          height: 100%;
        }

        .branding-content h1 {
          font-size: 3rem;
          font-weight: 700;
          line-height: 1.1;
          margin: 0 0 1rem 0;
          background: linear-gradient(135deg, #ffffff 0%, #c7d2fe 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .brand-tagline {
          font-size: 1.25rem;
          color: rgba(255, 255, 255, 0.7);
          margin: 0 0 3rem 0;
        }

        /* Registration Steps */
        .registration-steps {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .step-item {
          display: flex;
          gap: 1rem;
          align-items: center;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          transition: all 0.3s ease;
          opacity: 0.5;
        }

        .step-item.active {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(99, 102, 241, 0.5);
          opacity: 1;
        }

        .step-item.completed {
          opacity: 0.8;
        }

        .step-number {
          width: 36px;
          height: 36px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.7);
          flex-shrink: 0;
          transition: all 0.3s ease;
        }

        .step-item.active .step-number {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
        }

        .step-item.completed .step-number {
          background: #10b981;
          color: white;
        }

        .step-number svg {
          width: 18px;
          height: 18px;
        }

        .step-info h3 {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
        }

        .step-info p {
          margin: 0.25rem 0 0 0;
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.5);
        }

        .step-connector {
          width: 2px;
          height: 16px;
          background: rgba(255, 255, 255, 0.1);
          margin-left: 1rem + 18px;
          margin-left: calc(1rem + 18px);
        }

        /* Register Card */
        .portal-register-card {
          width: 100%;
          max-width: 520px;
          flex-shrink: 0;
          opacity: 0;
          transform: translateY(30px);
          transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
          transition-delay: 0.2s;
        }

        .portal-register-page.mounted .portal-register-card {
          opacity: 1;
          transform: translateY(0);
        }

        .register-card-inner {
          background: white;
          border-radius: 24px;
          padding: 2.5rem;
          box-shadow:
            0 25px 50px -12px rgba(0, 0, 0, 0.25),
            0 0 0 1px rgba(255, 255, 255, 0.1);
          max-height: calc(100vh - 150px);
          overflow-y: auto;
        }

        /* Register Header */
        .portal-register-header {
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .header-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
          border-radius: 100px;
          font-size: 0.8rem;
          color: #0369a1;
          font-weight: 500;
          margin-bottom: 1rem;
        }

        .header-badge.success {
          background: linear-gradient(135deg, #f0fdf4, #dcfce7);
          color: #166534;
        }

        .header-badge svg {
          width: 16px;
          height: 16px;
        }

        .portal-register-header h2 {
          font-size: 1.5rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 0.5rem 0;
        }

        .portal-register-header p {
          font-size: 0.9rem;
          color: #6b7280;
          margin: 0;
        }

        /* Error Message */
        .portal-register-error {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem;
          background: linear-gradient(135deg, #fef2f2, #fee2e2);
          border: 1px solid #fecaca;
          border-radius: 12px;
          margin-bottom: 1.5rem;
          animation: shake 0.5s ease-in-out;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }

        .portal-register-error svg {
          width: 20px;
          height: 20px;
          color: #dc2626;
          flex-shrink: 0;
        }

        .portal-register-error span {
          color: #991b1b;
          font-size: 0.85rem;
          font-weight: 500;
        }

        /* Form */
        .portal-register-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .form-field {
          position: relative;
        }

        .form-field label {
          display: block;
          font-size: 0.85rem;
          font-weight: 600;
          color: #374151;
          margin-bottom: 0.5rem;
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .field-icon {
          position: absolute;
          left: 1rem;
          width: 20px;
          height: 20px;
          color: #9ca3af;
          transition: color 0.2s ease;
          pointer-events: none;
        }

        .form-field.focused .field-icon,
        .form-field.has-value .field-icon {
          color: #6366f1;
        }

        .form-field input {
          width: 100%;
          padding: 0.875rem 1rem 0.875rem 3rem;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          font-size: 1rem;
          transition: all 0.2s ease;
          background: #f9fafb;
        }

        .form-field input:focus {
          outline: none;
          border-color: #6366f1;
          background: white;
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
        }

        .form-field input::placeholder {
          color: #9ca3af;
        }

        .form-field input[type="date"] {
          color: #374151;
        }

        .field-hint {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          margin-top: 0.5rem;
          font-size: 0.75rem;
          color: #6b7280;
        }

        .field-hint svg {
          width: 14px;
          height: 14px;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .ssn-mask {
          position: absolute;
          right: 1rem;
          color: #9ca3af;
          font-family: monospace;
          letter-spacing: 2px;
          pointer-events: none;
        }

        .toggle-password {
          position: absolute;
          right: 0.75rem;
          background: none;
          border: none;
          padding: 0.5rem;
          cursor: pointer;
          color: #9ca3af;
          transition: color 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .toggle-password:hover {
          color: #6366f1;
        }

        .toggle-password svg {
          width: 20px;
          height: 20px;
        }

        .match-indicator {
          position: absolute;
          right: 0.75rem;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .match-indicator.match {
          background: #dcfce7;
          color: #16a34a;
        }

        .match-indicator.no-match {
          background: #fee2e2;
          color: #dc2626;
        }

        .match-indicator svg {
          width: 14px;
          height: 14px;
        }

        /* Password Strength */
        .password-strength {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-top: 0.75rem;
        }

        .strength-bar {
          display: flex;
          gap: 4px;
          flex: 1;
        }

        .strength-segment {
          height: 4px;
          flex: 1;
          background: #e5e7eb;
          border-radius: 2px;
          transition: background-color 0.3s ease;
        }

        .strength-label {
          font-size: 0.75rem;
          font-weight: 600;
          min-width: 50px;
          text-align: right;
        }

        /* Password Requirements */
        .password-requirements {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
          margin-top: 0.75rem;
        }

        .requirement {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
          color: #9ca3af;
          transition: color 0.2s ease;
        }

        .requirement.met {
          color: #16a34a;
        }

        .requirement svg {
          width: 14px;
          height: 14px;
          flex-shrink: 0;
        }

        .requirement.met svg {
          color: #16a34a;
        }

        /* Terms Checkbox */
        .terms-checkbox {
          margin-top: 0.5rem;
        }

        .custom-checkbox {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          cursor: pointer;
          user-select: none;
        }

        .custom-checkbox input {
          display: none;
        }

        .checkmark {
          width: 20px;
          height: 20px;
          border: 2px solid #d1d5db;
          border-radius: 6px;
          transition: all 0.2s ease;
          position: relative;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .custom-checkbox input:checked + .checkmark {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border-color: transparent;
        }

        .custom-checkbox input:checked + .checkmark::after {
          content: '';
          position: absolute;
          left: 6px;
          top: 2px;
          width: 5px;
          height: 10px;
          border: solid white;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }

        .checkbox-label {
          font-size: 0.85rem;
          color: #4b5563;
          line-height: 1.5;
        }

        .checkbox-label a {
          color: #6366f1;
          text-decoration: none;
          font-weight: 500;
        }

        .checkbox-label a:hover {
          text-decoration: underline;
        }

        /* Buttons */
        .form-buttons {
          display: flex;
          gap: 1rem;
          margin-top: 0.5rem;
        }

        .back-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.875rem 1.25rem;
          background: white;
          color: #4b5563;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .back-btn:hover {
          border-color: #6366f1;
          color: #6366f1;
          background: #f5f3ff;
        }

        .back-btn svg {
          width: 18px;
          height: 18px;
        }

        .portal-submit-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 0.875rem 1.5rem;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .portal-submit-btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
          transition: left 0.5s ease;
        }

        .portal-submit-btn:hover::before {
          left: 100%;
        }

        .portal-submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 40px -10px rgba(99, 102, 241, 0.5);
        }

        .portal-submit-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .portal-submit-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .portal-submit-btn svg {
          width: 18px;
          height: 18px;
          transition: transform 0.3s ease;
        }

        .portal-submit-btn:hover svg {
          transform: translateX(4px);
        }

        .btn-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Divider */
        .portal-divider {
          display: flex;
          align-items: center;
          margin: 1.5rem 0;
        }

        .portal-divider::before,
        .portal-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: #e5e7eb;
        }

        .portal-divider span {
          padding: 0 1rem;
          font-size: 0.85rem;
          color: #9ca3af;
        }

        /* Login Link */
        .portal-login-link {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 0.875rem 1.5rem;
          background: white;
          color: #374151;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          font-size: 0.95rem;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.3s ease;
        }

        .portal-login-link:hover {
          border-color: #6366f1;
          color: #6366f1;
          background: #f5f3ff;
        }

        .portal-login-link svg {
          width: 20px;
          height: 20px;
        }

        /* Success Container */
        .success-container {
          text-align: center;
          padding: 1rem 0;
        }

        .success-icon {
          width: 80px;
          height: 80px;
          background: linear-gradient(135deg, #dcfce7, #bbf7d0);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1.5rem;
          animation: successPop 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes successPop {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }

        .success-icon svg {
          width: 40px;
          height: 40px;
          color: #16a34a;
        }

        .success-container h2 {
          font-size: 1.5rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 0.75rem 0;
        }

        .success-container > p {
          font-size: 0.95rem;
          color: #6b7280;
          margin: 0 0 1.5rem 0;
          line-height: 1.6;
        }

        .success-info {
          background: #f9fafb;
          border-radius: 12px;
          padding: 1rem;
          margin-bottom: 1.5rem;
        }

        .info-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0;
          font-size: 0.875rem;
          color: #4b5563;
        }

        .info-item svg {
          width: 18px;
          height: 18px;
          color: #6366f1;
          flex-shrink: 0;
        }

        .info-item strong {
          color: #111827;
        }

        .resend-text {
          margin-top: 1rem;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .resend-link {
          background: none;
          border: none;
          color: #6366f1;
          font-weight: 500;
          cursor: pointer;
          text-decoration: underline;
        }

        .resend-link:hover {
          color: #4f46e5;
        }

        /* Security Badge */
        .portal-security-badge {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid #f3f4f6;
        }

        .portal-security-badge svg {
          width: 18px;
          height: 18px;
          color: #10b981;
        }

        .portal-security-badge span {
          font-size: 0.8rem;
          color: #6b7280;
        }

        /* Footer */
        .portal-register-footer {
          position: relative;
          z-index: 1;
          padding: 1.5rem;
          text-align: center;
        }

        .portal-register-footer p {
          margin: 0;
          font-size: 0.875rem;
          color: rgba(255, 255, 255, 0.5);
        }

        .portal-register-footer a {
          color: rgba(255, 255, 255, 0.7);
          text-decoration: none;
          transition: color 0.2s ease;
        }

        .portal-register-footer a:hover {
          color: white;
        }

        /* Responsive Design */
        @media (max-width: 1024px) {
          .portal-branding {
            display: none;
          }

          .portal-register-container {
            justify-content: center;
          }
        }

        @media (max-width: 640px) {
          .portal-register-container {
            padding: 1rem;
          }

          .register-card-inner {
            padding: 1.5rem;
            border-radius: 20px;
          }

          .portal-register-header h2 {
            font-size: 1.25rem;
          }

          .form-field input {
            padding: 0.75rem 1rem 0.75rem 2.75rem;
          }

          .password-requirements {
            grid-template-columns: 1fr;
          }

          .form-buttons {
            flex-direction: column;
          }

          .back-btn {
            order: 2;
          }
        }
      `}</style>
    </div>
  );
}
