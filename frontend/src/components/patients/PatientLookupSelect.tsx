import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
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
  const labelId = `${inputId}-label`;
  const listboxId = `${inputId}-listbox`;
  const statusId = `${inputId}-status`;
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

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
      ? ''
      : selectedPatient
        ? selectedPatient.name
        : '';
  const hasSelectedPatientValue = Boolean(value) && (!includeAllOption || value !== allValue);
  const includesAllResult = includeAllOption && Boolean(query) && allLabel.toLowerCase().includes(search.toLowerCase());

  const shouldShowResults =
    !disabled &&
    !loading &&
    (filteredPatients.length > 0 || includesAllResult) &&
    (Boolean(query) || focused || (showInitialResults && !includeAllOption && !value));

  const visibleResults = filteredPatients.slice(0, maxResults);
  const resultCount = visibleResults.length + (includesAllResult ? 1 : 0);
  const getResultId = (index: number) => `${listboxId}-option-${index}`;
  const effectiveActiveIndex = shouldShowResults && resultCount > 0
    ? Math.min(Math.max(activeIndex, 0), resultCount - 1)
    : -1;

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!shouldShowResults && resultCount > 0) setFocused(true);
      if (resultCount > 0) {
        setActiveIndex((current) => event.key === 'ArrowDown'
          ? (current + 1 + resultCount) % resultCount
          : (current - 1 + resultCount) % resultCount);
      }
      return;
    }
    if (event.key === 'Home' && resultCount > 0) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === 'End' && resultCount > 0) {
      event.preventDefault();
      setActiveIndex(resultCount - 1);
      return;
    }
    if (event.key === 'Enter' && effectiveActiveIndex >= 0) {
      event.preventDefault();
      if (includesAllResult && effectiveActiveIndex === 0) {
        handleChange(allValue);
      } else {
        const patient = visibleResults[effectiveActiveIndex - (includesAllResult ? 1 : 0)];
        if (patient) handleChange(patient.id);
      }
      setFocused(false);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setFocused(false);
      setActiveIndex(-1);
    }
  };

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
        <label id={labelId} className={`patient-lookup__label ${labelClassName}`.trim()} htmlFor={inputId}>
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
          onChange={(event) => {
            setSearch(event.target.value);
            setActiveIndex(0);
          }}
          onFocus={() => {
            setFocused(true);
            setActiveIndex(0);
          }}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          onKeyDown={handleSearchKeyDown}
          placeholder={loading ? 'Loading patients...' : searchPlaceholder}
          disabled={disabled || loading}
          role="combobox"
          aria-labelledby={label ? labelId : undefined}
          aria-label={label ? `Search ${label.toLowerCase()}` : 'Search patients'}
          aria-autocomplete="list"
          aria-expanded={shouldShowResults}
          aria-controls={shouldShowResults ? listboxId : undefined}
          aria-activedescendant={effectiveActiveIndex >= 0 ? getResultId(effectiveActiveIndex) : undefined}
          aria-describedby={helperText ? `${statusId} ${inputId}-helper` : statusId}
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
        <div id={listboxId} className="patient-lookup__results" role="listbox" aria-label={`${label} search results`}>
          {includesAllResult && (
            <button
              type="button"
              id={getResultId(0)}
              role="option"
              tabIndex={-1}
              aria-selected={value === allValue}
              className={`patient-lookup__result ${value === allValue ? 'is-selected' : ''} ${effectiveActiveIndex === 0 ? 'is-active' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { handleChange(allValue); setFocused(false); }}
            >
              <span>{allLabel}</span>
            </button>
          )}
          {visibleResults.map((patient, index) => {
            const optionIndex = index + (includesAllResult ? 1 : 0);
            return (
              <button
                key={patient.id}
                type="button"
                id={getResultId(optionIndex)}
                role="option"
                tabIndex={-1}
                aria-selected={patient.id === value}
                className={`patient-lookup__result ${patient.id === value ? 'is-selected' : ''} ${effectiveActiveIndex === optionIndex ? 'is-active' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { handleChange(patient.id); setFocused(false); }}
              >
                <span className="patient-lookup__result-name">{patient.name}</span>
                <span className="patient-lookup__result-meta">
                  {patient.dateOfBirth ? `DOB ${formatDate(patient.dateOfBirth)}` : patient.mrn ? `MRN ${patient.mrn}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!loading && query && filteredPatients.length === 0 && (
        <div className="patient-lookup__empty" role="status" aria-live="polite">{emptyLabel}</div>
      )}

      {!hideSelect && (
        <select
          id={selectId}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          disabled={disabled || loading}
          required={required}
          className={`patient-lookup__select ${selectClassName}`.trim()}
          aria-label={`${label} selection`}
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

      <div id={statusId} className="sr-only" role="status" aria-live="polite">
        {loading ? 'Loading patients' : shouldShowResults ? `${resultCount} patient${resultCount === 1 ? '' : 's'} available` : ''}
      </div>
      {helperText && <div id={`${inputId}-helper`} className="patient-lookup__helper">{helperText}</div>}
    </div>
  );
}
