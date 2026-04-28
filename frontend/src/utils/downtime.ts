import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createPDFBlob, deliverBlob, formatDate, formatPhone, sanitizeFilename, type ExportColumn } from './export';
import type { DowntimeDeviceProfile, DowntimePacket } from '../api';

export type EffectiveDowntimeDevice = 'ipad' | 'desktop';
export interface DowntimePacketPreparedRecord {
  source: 'automatic' | 'manual';
  preparedAt: string;
  packetGeneratedAt?: string;
}

function isIpadLikeDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.platform || '';
  const userAgent = navigator.userAgent || '';
  return /iPad/i.test(userAgent) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function resolveDowntimeDeviceProfile(profile: DowntimeDeviceProfile = 'auto'): EffectiveDowntimeDevice {
  if (profile === 'ipad') return 'ipad';
  if (profile === 'desktop') return 'desktop';
  return isIpadLikeDevice() ? 'ipad' : 'desktop';
}

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function parsePacketTime(packetTime: string): { hours: number; minutes: number } {
  const [hoursValue, minutesValue] = packetTime.split(':').map((value) => Number(value));
  if (!Number.isFinite(hoursValue) || !Number.isFinite(minutesValue)) {
    return { hours: 12, minutes: 0 };
  }
  return { hours: hoursValue, minutes: minutesValue };
}

export function getNextBusinessDay(date: Date): Date {
  const next = startOfLocalDay(date);
  do {
    next.setDate(next.getDate() + 1);
  } while (isWeekend(next));
  return next;
}

export function hasReachedDowntimePacketCutoff(packetTime: string, now: Date = new Date()): boolean {
  const today = startOfLocalDay(now);
  if (isWeekend(today)) {
    return true;
  }

  const { hours, minutes } = parsePacketTime(packetTime);
  const cutoff = new Date(today);
  cutoff.setHours(hours, minutes, 0, 0);
  return now.getTime() >= cutoff.getTime();
}

export function getDowntimeTargetDate(_packetTime: string, now: Date = new Date()): string {
  return formatLocalDateKey(getNextBusinessDay(now));
}

export function getDowntimePacketCacheKey(locationId: string, date: string): string {
  return `downtime-packet:${locationId}:${date}`;
}

export function getDowntimePacketPreparedKey(locationId: string, date: string): string {
  return `downtime-packet:prepared:${locationId}:${date}`;
}

export function saveDowntimePacketToCache(packet: DowntimePacket): void {
  localStorage.setItem(getDowntimePacketCacheKey(packet.location.id, packet.date), JSON.stringify(packet));
}

export function loadCachedDowntimePacket(locationId: string, date: string): DowntimePacket | null {
  const raw = localStorage.getItem(getDowntimePacketCacheKey(locationId, date));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DowntimePacket;
  } catch {
    return null;
  }
}

export function getPreparedDowntimePacketRecord(
  locationId: string,
  date: string,
): DowntimePacketPreparedRecord | null {
  const raw = localStorage.getItem(getDowntimePacketPreparedKey(locationId, date));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DowntimePacketPreparedRecord;
  } catch {
    return null;
  }
}

export function markDowntimePacketPrepared(
  locationId: string,
  date: string,
  source: 'automatic' | 'manual',
  packetGeneratedAt?: string,
): void {
  const payload: DowntimePacketPreparedRecord = {
    source,
    preparedAt: new Date().toISOString(),
    packetGeneratedAt,
  };
  localStorage.setItem(
    getDowntimePacketPreparedKey(locationId, date),
    JSON.stringify(payload),
  );
}

export function hasPreparedDowntimePacket(
  locationId: string,
  date: string,
  packetGeneratedAt?: string,
): boolean {
  const record = getPreparedDowntimePacketRecord(locationId, date);
  if (!record) return false;
  if (!packetGeneratedAt) return true;
  return record.packetGeneratedAt === packetGeneratedAt;
}

function formatStatusLabel(status?: string | null): string {
  if (!status) return 'Scheduled';
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function joinLines(lines: Array<string | null | undefined>): string {
  return lines
    .map((line) => (typeof line === 'string' ? line.trim() : ''))
    .filter(Boolean)
    .join('\n');
}

function truncateText(value: string | null | undefined, maxLength = 180): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

type DowntimePacketRow = {
  timeRange: string;
  locationLabel?: string;
  patientDetails: string;
  visitDetails: string;
  coverageAndAlerts: string;
  notesSummary: string;
};

function buildDowntimePacketRows(packet: DowntimePacket, includeLocationColumn = false): DowntimePacketRow[] {
  if (packet.appointments.length === 0) {
    return [
      {
        timeRange: '—',
        locationLabel: includeLocationColumn ? packet.location.name : undefined,
        patientDetails: 'No scheduled patients',
        visitDetails: '—',
        coverageAndAlerts: '—',
        notesSummary: '—',
      },
    ];
  }

  return packet.appointments.map((appointment) => {
    const timeRange = appointment.scheduledEnd
      ? `${formatDate(appointment.scheduledStart, 'time')} - ${formatDate(appointment.scheduledEnd, 'time')}`
      : formatDate(appointment.scheduledStart, 'time');

    const patientDetails = joinLines([
      appointment.patientName,
      appointment.mrn ? `MRN: ${appointment.mrn}` : null,
      packet.settings.includeDob ? `DOB: ${formatDate(appointment.dob, 'short') || '—'}` : null,
      packet.settings.includePhone ? `Phone: ${formatPhone(appointment.phone) || '—'}` : null,
      appointment.addressLine ? `Address: ${truncateText(appointment.addressLine, 90)}` : null,
    ]);

    const visitDetails = joinLines([
      appointment.providerName,
      `Type: ${appointment.appointmentTypeName || 'Visit'}`,
      appointment.locationName ? `Location: ${appointment.locationName}` : null,
      `Status: ${formatStatusLabel(appointment.status)}`,
    ]);

    const coverageAndAlerts = joinLines([
      packet.settings.includeInsurance ? `Insurance: ${appointment.insurance || '—'}` : null,
      packet.settings.includeInsurance && appointment.insuranceId ? `Member ID: ${appointment.insuranceId}` : null,
      packet.settings.includeInsurance && appointment.insuranceGroupNumber ? `Group: ${appointment.insuranceGroupNumber}` : null,
      appointment.allergies ? `Allergies: ${truncateText(appointment.allergies, 130)}` : null,
    ]) || '—';

    const notesSummary = joinLines([
      appointment.chiefComplaint ? `Chief complaint: ${truncateText(appointment.chiefComplaint, 150)}` : null,
      appointment.reason ? `Reason: ${truncateText(appointment.reason, 150)}` : null,
      appointment.clinicalSnapshot ? `Clinical context: ${truncateText(appointment.clinicalSnapshot, 220)}` : null,
      appointment.medicationsSummary ? `Meds: ${truncateText(appointment.medicationsSummary, 160)}` : null,
      appointment.notes ? `Notes: ${truncateText(appointment.notes, 180)}` : null,
    ]) || '—';

    return {
      timeRange,
      locationLabel: includeLocationColumn ? packet.location.name : undefined,
      patientDetails,
      visitDetails,
      coverageAndAlerts,
      notesSummary,
    };
  });
}

export function deliverDowntimePacket(packet: DowntimePacket, profile: DowntimeDeviceProfile = 'auto'): EffectiveDowntimeDevice {
  const device = resolveDowntimeDeviceProfile(profile);
  const columns: ExportColumn[] = [
    { key: 'timeRange', label: 'Time' },
    { key: 'patientDetails', label: 'Patient' },
    { key: 'visitDetails', label: 'Visit' },
    { key: 'coverageAndAlerts', label: 'Coverage / Alerts' },
    { key: 'notesSummary', label: 'Notes' },
  ];

  const rows = buildDowntimePacketRows(packet);

  const { blob, filename } = createPDFBlob(rows, `${packet.location.name}-downtime-packet-${packet.date}`, {
    title: `Downtime Packet - ${formatDate(packet.date, 'long')} (${packet.counts.total} appointments)`,
    orientation: 'landscape',
    practiceName: packet.location.name,
    practiceAddress: [packet.location.address, packet.location.phone, `${packet.counts.total} appointments`].filter(Boolean).join(' • '),
    columns,
    includeTimestamp: false,
    fontSize: 8,
  });

  deliverBlob(blob, filename, device === 'ipad' ? 'preview' : 'download');
  return device;
}

export function deliverCombinedDowntimePackets(
  packets: DowntimePacket[],
  profile: DowntimeDeviceProfile = 'auto',
): EffectiveDowntimeDevice {
  if (packets.length === 0) {
    throw new Error('No downtime packets available to download');
  }

  const device = resolveDowntimeDeviceProfile(profile);
  const sortedPackets = [...packets].sort((a, b) => a.location.name.localeCompare(b.location.name));
  const totalAppointments = sortedPackets.reduce((sum, packet) => sum + packet.counts.total, 0);
  const uniqueDates = Array.from(new Set(sortedPackets.map((packet) => packet.date)));
  const dateLabel = uniqueDates.length === 1
    ? formatDate(uniqueDates[0], 'long')
    : `${formatDate(uniqueDates[0], 'short')} - ${formatDate(uniqueDates[uniqueDates.length - 1], 'short')}`;
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'letter',
  });
  const columns: ExportColumn[] = [
    { key: 'timeRange', label: 'Time' },
    { key: 'patientDetails', label: 'Patient' },
    { key: 'visitDetails', label: 'Visit' },
    { key: 'coverageAndAlerts', label: 'Coverage / Alerts' },
    { key: 'notesSummary', label: 'Notes' },
  ];

  sortedPackets.forEach((packet, index) => {
    if (index > 0) {
      doc.addPage();
    }

    let yPosition = 15;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Downtime Packet', 15, yPosition);
    yPosition += 7;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`${dateLabel} • ${sortedPackets.length} locations • ${totalAppointments} appointments`, 15, yPosition);
    yPosition += 8;

    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(packet.location.name, 15, yPosition);
    yPosition += 6;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      [packet.location.address, packet.location.phone, `${packet.counts.total} appointments`].filter(Boolean).join(' • '),
      15,
      yPosition,
    );
    yPosition += 8;

    const rows = buildDowntimePacketRows(packet).map((row) => ([
      row.timeRange,
      row.patientDetails,
      row.visitDetails,
      row.coverageAndAlerts,
      row.notesSummary,
    ]));

    autoTable(doc, {
      head: [columns.map((column) => column.label)],
      body: rows,
      startY: yPosition,
      styles: {
        fontSize: 8,
        cellPadding: 3,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [8, 145, 178],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'left',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      margin: { left: 15, right: 15 },
      didDrawPage: () => {
        const pageCount = doc.getNumberOfPages();
        const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Page ${currentPage} of ${pageCount}`,
          doc.internal.pageSize.width / 2,
          doc.internal.pageSize.height - 10,
          { align: 'center' },
        );
      },
    });
  });

  const filename = `${sanitizeFilename(`all-locations-downtime-packet-${sortedPackets[0]?.date || 'next-business-day'}`)}.pdf`;
  const blob = doc.output('blob');

  deliverBlob(blob, filename, device === 'ipad' ? 'preview' : 'download');
  return device;
}
