import { useId, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { formatDateOnly } from '../../utils/dateOnly';
import './PatientLookupSelect.css';

export interface PatientLookupOption {
  id?: string | number;
  patientId?: string | number;
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  fullName?: string;
  full_name?: string;
  name?: string;
  dob?: string;
  dateOfBirth?: string;
  date_of_birth?: string;
  mrn?: string;
  phone?: string;
  mobilePhone?: string;
  mobile_phone?: string;
  homePhone?: string;
  home_phone?: string;
}

interface NormalizedPatient {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  dateOfBirth: string;
  mrn: string;
  phone: string;
  raw: PatientLookupOption;
}

interface PatientLookupSelectProps {
  patients: PatientLookupOption[];
  value: string;
  onChange: (patientId: string) => void;
  label?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  loading?: boolean;
  includeAllOption?: boolean;
  allValue?: string;
  allLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  helperText?: string;
  emptyLabel?: string;
  maxResults?: number;
  maxSelectOptions?: number;
  showInitialResults?: boolean;
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
  selectClassName?: string;
  style?: CSSProperties;
  compact?: boolean;
  hideSelect?: boolean;
  onPatientSelect?: (patient: PatientLookupOption | null) => void;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function formatDate(value: string): string {
  if (!value) return '';
  return formatDateOnly(value) || value;
}

function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getPatientId(patient: PatientLookupOption): string {
  return toText(patient.id || patient.patientId);
}

function normalizePatient(patient: PatientLookupOption): NormalizedPatient | null {
  const id = getPatientId(patient);
  if (!id) return null;

  const firstName = toText(patient.firstName || patient.first_name);
  const lastName = toText(patient.lastName || patient.last_name);
  const fallbackName = toText(patient.fullName || patient.full_name || patient.name);
  const name = firstName || lastName ? `${lastName}, ${firstName}`.replace(/^,\s*/, '').trim() : fallbackName || id;
  const dateOfBirth = toText(patient.dateOfBirth || patient.date_of_birth || patient.dob);
  const phone = toText(patient.mobilePhone || patient.mobile_phone || patient.phone || patient.homePhone || patient.home_phone);

  return {
    id,
    firstName,
    lastName,
    name,
    dateOfBirth,
    mrn: toText(patient.mrn),
    phone,
    raw: patient,
  };
}

export function formatPatientLookupName(patient?: PatientLookupOption | null): string {
  if (!patient) return '';
  return normalizePatient(patient)?.name || '';
}

export function PatientLookupSelect({
  patients,
  value,
  onChange,
  label = 'Patient',
  id,
  required = false,
  disabled = false,
  loading = false,
  includeAllOption = false,
  allValue = '',
  allLabel = 'All Patients',
  placeholder = 'Select patient...',
  searchPlaceholder = 'Search patient by name, DOB, MRN, or phone',
  helperText,
  emptyLabel = 'No matching patients',
  maxResults = 8,
  maxSelectOptions = 150,
  showInitialResults = true,
  className = '',
  labelClassName = '',
  inputClassName = '',
  selectClassName = '',
  style,
  compact = false,
  hideSelect = false,
  onPatientSelect,
}: PatientLookupSelectProps) {
  const generatedId = useId();
  const inputId = id ? `${id}-search` : `${generatedId}-patient-search`;
  const selectId = id || `${generatedId}-patient-select`;
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);

  const normalizedPatients = useMemo(
    () =>
      patients
        .map(normalizePatient)
        .filter((patient): patient is NormalizedPatient => Boolean(patient))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [patients],
  );

  const selectedPatient = useMemo(
    () => normalizedPatients.find((patient) => patient.id === value) || null,
    [normalizedPatients, value],
  );

  const query = normalizeForSearch(search);
  const filteredPatients = useMemo(() => {
    if (!query) return normalizedPatients;

    const queryDigits = query.replace(/\D/g, '');
    return normalizedPatients.filter((patient) => {
      const searchable = normalizeForSearch(
        [
          patient.name,
          `${patient.firstName} ${patient.lastName}`,
          `${patient.lastName} ${patient.firstName}`,
          patient.dateOfBirth,
          formatDate(patient.dateOfBirth),
          patient.mrn,
          patient.phone,
        ].join(' '),
      );
      const phoneDigits = patient.phone.replace(/\D/g, '');
      return searchable.includes(query) || (!!queryDigits && phoneDigits.includes(queryDigits));
    });
  }, [normalizedPatients, query]);

  const handleChange = (patientId: string) => {
    onChange(patientId);
    const next = normalizedPatients.find((patient) => patient.id === patientId) || null;
    onPatientSelect?.(next?.raw || null);
    if (patientId && patientId !== allValue) {
      setSearch(next?.name || '');
    }
  };

  const handleClear = () => {
    handleChange(includeAllOption ? allValue : '');
    setSearch('');
  };

  const selectedLabel =
    includeAllOption && value === allValue
      ? allLabel
      : selectedPatient
        ? selectedPatient.name
        : '';
  const hasSelectedPatientValue = Boolean(value) && (!includeAllOption || value !== allValue);

  const shouldShowResults =
    !disabled &&
    !loading &&
    filteredPatients.length > 0 &&
    (Boolean(query) || focused || (showInitialResults && !includeAllOption && !value));

  const visibleResults = filteredPatients.slice(0, maxResults);
  const visibleSelectOptions = useMemo(() => {
    const options = filteredPatients.slice(0, maxSelectOptions);
    if (selectedPatient && !options.some((patient) => patient.id === selectedPatient.id)) {
      return [selectedPatient, ...options];
    }
    return options;
  }, [filteredPatients, maxSelectOptions, selectedPatient]);

  return (
    <div
      className={`patient-lookup ${compact ? 'patient-lookup--compact' : ''} ${className}`.trim()}
      style={style}
    >
      {label && (
        <label className={`patient-lookup__label ${labelClassName}`.trim()} htmlFor={hideSelect ? inputId : selectId}>
          {label}
          {required && <span className="patient-lookup__required"> *</span>}
        </label>
      )}

      <div className="patient-lookup__search-row">
        <input
          id={inputId}
          type="text"
          className={`patient-lookup__search ${inputClassName}`.trim()}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          placeholder={loading ? 'Loading patients...' : searchPlaceholder}
          disabled={disabled || loading}
          aria-label={`Search ${label.toLowerCase()}`}
          autoComplete="off"
        />
        {hasSelectedPatientValue && !disabled && !required && (
          <button type="button" className="patient-lookup__clear" onClick={handleClear}>
            Clear
          </button>
        )}
      </div>

      {selectedLabel && (
        <div className="patient-lookup__selected">
          <span>{selectedLabel}</span>
          {selectedPatient?.dateOfBirth && <span>DOB {formatDate(selectedPatient.dateOfBirth)}</span>}
          {selectedPatient?.mrn && <span>MRN {selectedPatient.mrn}</span>}
        </div>
      )}

      {shouldShowResults && (
        <div className="patient-lookup__results" role="list" aria-label={`${label} search results`}>
          {includeAllOption && query && allLabel.toLowerCase().includes(search.toLowerCase()) && (
            <button
              type="button"
              className={`patient-lookup__result ${value === allValue ? 'is-selected' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleChange(allValue)}
            >
              <span>{allLabel}</span>
            </button>
          )}
          {visibleResults.map((patient) => (
            <button
              key={patient.id}
              type="button"
              className={`patient-lookup__result ${patient.id === value ? 'is-selected' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleChange(patient.id)}
            >
              <span className="patient-lookup__result-name">{patient.name}</span>
              <span className="patient-lookup__result-meta">
                {patient.dateOfBirth ? `DOB ${formatDate(patient.dateOfBirth)}` : patient.mrn ? `MRN ${patient.mrn}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      {!loading && query && filteredPatients.length === 0 && (
        <div className="patient-lookup__empty">{emptyLabel}</div>
      )}

      {!hideSelect && (
        <select
          id={selectId}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          disabled={disabled || loading}
          required={required}
          className={`patient-lookup__select ${selectClassName}`.trim()}
        >
          {includeAllOption && <option value={allValue}>{allLabel}</option>}
          {!includeAllOption && <option value="">{loading ? 'Loading patients...' : placeholder}</option>}
          {visibleSelectOptions.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.name}
              {patient.dateOfBirth ? ` - DOB ${formatDate(patient.dateOfBirth)}` : ''}
              {patient.mrn ? ` - MRN ${patient.mrn}` : ''}
            </option>
          ))}
        </select>
      )}

      {helperText && <div className="patient-lookup__helper">{helperText}</div>}
    </div>
  );
}
