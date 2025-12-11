import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { Patient } from '../../types';

interface TopBarProps {
  patients?: Patient[];
  onRefresh?: () => void;
}

export function TopBar({ patients = [], onRefresh }: TopBarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState('');

  const handlePatientSelect = (patientId: string) => {
    if (patientId) {
      navigate(`/patients/${patientId}`);
      setSearchValue('');
    }
  };

  return (
    <header className="ema-header">
      <div className="ema-header-left">
        <div className="ema-brand">
          Mountain Pine<br />Dermatology PLLC
        </div>
      </div>

      <div className="ema-header-center">
        <div className="ema-patient-search">
          <select
            className="ema-search-select"
            value={searchValue}
            onChange={(e) => handlePatientSelect(e.target.value)}
          >
            <option value="">Patient Search...</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.lastName}, {p.firstName} - {p.mrn || 'No MRN'}
              </option>
            ))}
          </select>
          {onRefresh && (
            <button type="button" className="ema-refresh-btn" onClick={onRefresh} title="Refresh">
              ⟳
            </button>
          )}
        </div>
      </div>

      <div className="ema-header-right">
        {user && (
          <div className="ema-user-info">
            <span className="ema-user-name">{user.fullName}</span>
            <select className="ema-role-select" defaultValue={user.role}>
              <option value={user.role}>Select {user.role}</option>
            </select>
          </div>
        )}
        <div className="ema-header-links">
          <span className="ema-help-icon">🧩</span>
          <a href="#" className="ema-link">Help</a>
          <span className="ema-separator">•</span>
          <a href="#" className="ema-link">Feedback</a>
          <span className="ema-separator">•</span>
          <a href="#" className="ema-link">Customer Portal</a>
          <span className="ema-separator">•</span>
          <a href="#" className="ema-link">Preferences</a>
          <span className="ema-separator">•</span>
          <a href="#" className="ema-link">My Account ▾</a>
          <span className="ema-separator">•</span>
          <button type="button" className="ema-link-btn" onClick={logout}>Logout</button>
        </div>
      </div>
    </header>
  );
}
