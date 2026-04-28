import { randomUUID } from "crypto";
import { pool } from "../db/pool";
import { getTableColumns } from "../db/schema";
import {
  DEFAULT_DOWNTIME_SETTINGS,
  type DowntimeSettings,
  mapDowntimeSettings,
} from "../lib/downtimeSettings";
import { logger } from "../lib/logger";
import {
  addDaysToDateKey,
  getDateKeyInTimeZone,
  getPracticeTimeZone,
  getUtcRangeForPracticeDate,
  getWeekdayForDateKey,
} from "../lib/practiceTimeZone";

interface LocationRow {
  id: string;
  tenantId: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  downtimePacketsEnabled?: boolean | null;
  downtimePacketTime?: string | null;
  downtimeDeviceProfile?: string | null;
  downtimeIncludeDob?: boolean | null;
  downtimeIncludePhone?: boolean | null;
  downtimeIncludeInsurance?: boolean | null;
}

interface StoredDowntimePacketRow {
  id: string;
  generatedAt: Date | string;
  packetPayload: DowntimePacket;
}

export interface DowntimePacketAppointment {
  appointmentId: string;
  patientId: string;
  scheduledStart: string;
  scheduledEnd?: string | null;
  status: string;
  patientName: string;
  mrn?: string | null;
  dob?: string | null;
  phone?: string | null;
  addressLine?: string | null;
  insurance?: string | null;
  insuranceId?: string | null;
  insuranceGroupNumber?: string | null;
  allergies?: string | null;
  providerName: string;
  locationName?: string | null;
  appointmentTypeName: string;
  reason?: string | null;
  chiefComplaint?: string | null;
  clinicalSnapshot?: string | null;
  medicationsSummary?: string | null;
  notes?: string | null;
}

export interface DowntimePacket {
  date: string;
  generatedAt: string;
  location: {
    id: string;
    name: string;
    address?: string | null;
    phone?: string | null;
  };
  settings: DowntimeSettings;
  counts: {
    total: number;
    byStatus: Record<string, number>;
  };
  appointments: DowntimePacketAppointment[];
}

export interface PrepareReadyPacketsResult {
  locationsChecked: number;
  packetsPrepared: number;
  packetsReused: number;
  failures: number;
}

const LOCATION_SELECT = `select id,
                                tenant_id as "tenantId",
                                name,
                                address,
                                phone,
                                downtime_packets_enabled as "downtimePacketsEnabled",
                                downtime_packet_time as "downtimePacketTime",
                                downtime_device_profile as "downtimeDeviceProfile",
                                downtime_include_dob as "downtimeIncludeDob",
                                downtime_include_phone as "downtimeIncludePhone",
                                downtime_include_insurance as "downtimeIncludeInsurance"
                         from locations`;

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parsePacketTime(packetTime: string): { hours: number; minutes: number } {
  const [hoursRaw, minutesRaw] = packetTime.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return parsePacketTime(DEFAULT_DOWNTIME_SETTINGS.packetTime);
  }
  return { hours, minutes };
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

function isWeekendDateKey(dateKey: string): boolean {
  const day = getWeekdayForDateKey(dateKey);
  return day === 0 || day === 6;
}

export function getNextBusinessDay(baseDate: Date): Date {
  const next = startOfLocalDay(baseDate);
  do {
    next.setDate(next.getDate() + 1);
  } while (isWeekend(next));
  return next;
}

function getPracticeClockParts(now: Date, timeZone = getPracticeTimeZone()): { hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? Number.NaN);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? Number.NaN);

  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function getNextBusinessDayDateKey(baseDateKey: string): string {
  let nextDateKey = baseDateKey;
  do {
    nextDateKey = addDaysToDateKey(nextDateKey, 1);
  } while (isWeekendDateKey(nextDateKey));
  return nextDateKey;
}

export function hasReachedDowntimePacketCutoff(packetTime: string, now: Date = new Date()): boolean {
  const practiceTimeZone = getPracticeTimeZone();
  const currentDateKey = getDateKeyInTimeZone(now, practiceTimeZone);
  if (isWeekendDateKey(currentDateKey)) {
    return true;
  }

  const { hours, minutes } = parsePacketTime(packetTime);
  const currentTime = getPracticeClockParts(now, practiceTimeZone);
  if (currentTime.hour > hours) {
    return true;
  }
  return currentTime.hour === hours && currentTime.minute >= minutes;
}

export function getTargetDowntimePacketDate(_packetTime: string, now: Date = new Date()): string {
  const practiceTimeZone = getPracticeTimeZone();
  const currentDateKey = getDateKeyInTimeZone(now, practiceTimeZone);
  return getNextBusinessDayDateKey(currentDateKey);
}

function normalizePacketDate(value: unknown, fallback: Date = new Date()): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return formatDateKey(fallback);
}

function sortStatusMap(source: Record<string, number>): Record<string, number> {
  return Object.keys(source)
    .sort()
    .reduce<Record<string, number>>((acc, key) => {
      acc[key] = source[key] ?? 0;
      return acc;
    }, {});
}

function normalizePacketForComparison(packet: DowntimePacket): Omit<DowntimePacket, "generatedAt"> {
  const rest = { ...packet } as Record<string, unknown>;
  delete rest.generatedAt;
  return {
    ...(rest as Omit<DowntimePacket, "generatedAt">),
    counts: {
      total: packet.counts.total,
      byStatus: sortStatusMap(packet.counts.byStatus),
    },
    appointments: [...packet.appointments].sort((a, b) => {
      if (a.scheduledStart !== b.scheduledStart) {
        return a.scheduledStart.localeCompare(b.scheduledStart);
      }
      return a.appointmentId.localeCompare(b.appointmentId);
    }),
  };
}

function packetsMatch(existing: DowntimePacket, next: DowntimePacket): boolean {
  return JSON.stringify(normalizePacketForComparison(existing)) === JSON.stringify(normalizePacketForComparison(next));
}

function nullText(alias: string): string {
  return `null::text as "${alias}"`;
}

function trimmedColumnOrNull(
  tableAlias: string,
  columns: Set<string>,
  columnName: string,
  alias = columnName,
): string {
  return columns.has(columnName)
    ? `nullif(trim(${tableAlias}.${columnName}), '') as "${alias}"`
    : nullText(alias);
}

function coalescedTextOrNull(alias: string, expressions: Array<string | null | false | undefined>): string {
  const available = expressions.filter((expression): expression is string => typeof expression === "string" && expression.trim().length > 0);
  return available.length > 0
    ? `coalesce(${available.join(", ")}) as "${alias}"`
    : nullText(alias);
}

async function loadLocationForTenant(tenantId: string, locationId: string): Promise<LocationRow | null> {
  const result = await pool.query(
    `${LOCATION_SELECT}
      where tenant_id = $1 and id = $2
      limit 1`,
    [tenantId, locationId],
  );
  return result.rowCount ? (result.rows[0] as LocationRow) : null;
}

async function loadAllEnabledLocations(): Promise<LocationRow[]> {
  const result = await pool.query(
    `${LOCATION_SELECT}
      where is_active = true
        and coalesce(downtime_packets_enabled, false) = true
      order by tenant_id, name`,
  );
  return result.rows as LocationRow[];
}

async function loadAppointmentsForPacket(
  tenantId: string,
  locationId: string,
  date: string,
): Promise<DowntimePacketAppointment[]> {
  const [
    patientColumns,
    appointmentColumns,
    encounterColumns,
    visitSummaryColumns,
    prescriptionColumns,
    allergyColumns,
  ] = await Promise.all([
    getTableColumns("patients"),
    getTableColumns("appointments"),
    getTableColumns("encounters"),
    getTableColumns("visit_summaries"),
    getTableColumns("prescriptions"),
    getTableColumns("patient_allergies"),
  ]);

  const patientStreetExpr = patientColumns.has("address") ? `coalesce(p.address, '')` : `''`;
  const patientCityExpr = patientColumns.has("city") ? `coalesce(p.city, '')` : `''`;
  const patientStateExpr = patientColumns.has("state") ? `coalesce(p.state, '')` : `''`;
  const patientZipExpr = patientColumns.has("zip") ? `coalesce(p.zip, '')` : `''`;
  const addressLineSelect =
    patientColumns.has("address") || patientColumns.has("city") || patientColumns.has("state") || patientColumns.has("zip")
      ? `nullif(
           trim(
             concat_ws(', ',
               nullif(trim(${patientStreetExpr}), ''),
               nullif(trim(concat_ws(' ', ${patientCityExpr}, ${patientStateExpr}, ${patientZipExpr})), '')
             )
           ),
           ''
         ) as "addressLine"`
      : nullText("addressLine");

  const encounterOrderBy =
    encounterColumns.has("updated_at")
      ? `e.updated_at desc nulls last, `
      : encounterColumns.has("created_at")
        ? `e.created_at desc nulls last, `
        : "";
  const encounterJoin = encounterColumns.size > 0
    ? `left join lateral (
         select ${trimmedColumnOrNull("e", encounterColumns, "chief_complaint", "chiefComplaint")},
                ${trimmedColumnOrNull("e", encounterColumns, "assessment_plan", "assessmentPlan")}
           from encounters e
          where e.tenant_id = a.tenant_id
            and e.patient_id = a.patient_id
          order by ${encounterOrderBy}e.id desc
          limit 1
       ) latest_encounter on true`
    : "";

  const visitSummaryOrderBy =
    visitSummaryColumns.has("visit_date")
      ? `vs.visit_date desc nulls last, `
      : visitSummaryColumns.has("created_at")
        ? `vs.created_at desc nulls last, `
        : "";
  const visitSummaryJoin = visitSummaryColumns.size > 0
    ? `left join lateral (
         select ${trimmedColumnOrNull("vs", visitSummaryColumns, "summary_text", "summaryText")},
                ${trimmedColumnOrNull("vs", visitSummaryColumns, "chief_complaint", "chiefComplaint")},
                ${trimmedColumnOrNull("vs", visitSummaryColumns, "diagnosis_shared", "diagnosisShared")}
           from visit_summaries vs
          where vs.tenant_id = a.tenant_id
            and vs.patient_id = a.patient_id
          order by ${visitSummaryOrderBy}vs.id desc
          limit 1
       ) latest_visit_summary on true`
    : "";

  const prescriptionSortExpr = prescriptionColumns.has("prescribed_date")
    ? "prx.prescribed_date"
    : prescriptionColumns.has("written_date")
      ? "prx.written_date"
      : prescriptionColumns.has("created_at")
        ? "prx.created_at"
        : "null";
  const prescriptionJoin = prescriptionColumns.has("medication_name")
    ? `left join lateral (
         select string_agg(rx.medication_name, ', ' order by rx.sort_date desc nulls last, rx.medication_name asc) as "recentMedications"
           from (
             select distinct nullif(trim(prx.medication_name), '') as medication_name,
                    ${prescriptionSortExpr} as sort_date
               from prescriptions prx
              where prx.tenant_id = a.tenant_id
                and prx.patient_id = a.patient_id
                and nullif(trim(prx.medication_name), '') is not null
              order by sort_date desc nulls last, medication_name asc
              limit 3
           ) rx
       ) latest_prescriptions on true`
    : "";

  const allergyJoin = allergyColumns.has("allergen")
    ? `left join lateral (
         select string_agg(
                  trim(
                    pa.allergen ||
                    ${
                      allergyColumns.has("reaction")
                        ? `case
                             when nullif(trim(pa.reaction), '') is not null
                               then ' (' || trim(pa.reaction) || ')'
                             else ''
                           end`
                        : `''`
                    }
                  ),
                  '; ' order by pa.allergen asc
                ) as "allergySummary"
           from patient_allergies pa
          where pa.tenant_id = a.tenant_id
            and pa.patient_id = a.patient_id
            ${
              allergyColumns.has("status")
                ? `and coalesce(pa.status, 'active') = 'active'`
                : ""
            }
       ) allergy_summary on true`
    : "";

  const chiefComplaintSelect = coalescedTextOrNull("chiefComplaint", [
    appointmentColumns.has("chief_complaint") ? `nullif(trim(a.chief_complaint), '')` : null,
    visitSummaryColumns.size > 0 ? `latest_visit_summary."chiefComplaint"` : null,
    encounterColumns.size > 0 ? `latest_encounter."chiefComplaint"` : null,
  ]);

  const clinicalSnapshotSelect = coalescedTextOrNull("clinicalSnapshot", [
    visitSummaryColumns.size > 0 ? `latest_visit_summary."summaryText"` : null,
    visitSummaryColumns.size > 0 ? `latest_visit_summary."diagnosisShared"` : null,
    encounterColumns.size > 0 ? `latest_encounter."assessmentPlan"` : null,
    patientColumns.has("current_symptoms") ? `nullif(trim(p.current_symptoms), '')` : null,
    patientColumns.has("past_medical_history") ? `nullif(trim(p.past_medical_history), '')` : null,
  ]);

  const medicationsSummarySelect = coalescedTextOrNull("medicationsSummary", [
    prescriptionColumns.has("medication_name") ? `latest_prescriptions."recentMedications"` : null,
    patientColumns.has("medications") ? `nullif(trim(p.medications), '')` : null,
  ]);

  const allergiesSelect = coalescedTextOrNull("allergies", [
    allergyColumns.has("allergen") ? `allergy_summary."allergySummary"` : null,
    patientColumns.has("allergies") ? `nullif(trim(p.allergies), '')` : null,
  ]);

  const { start, end } = getUtcRangeForPracticeDate(date, getPracticeTimeZone());
  const result = await pool.query(
    `select a.id as "appointmentId",
            a.patient_id as "patientId",
            a.scheduled_start as "scheduledStart",
            a.scheduled_end as "scheduledEnd",
            a.status,
            trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as "patientName",
            ${trimmedColumnOrNull("p", patientColumns, "mrn", "mrn")},
            ${patientColumns.has("dob") ? `p.dob` : `null::date`} as "dob",
            ${trimmedColumnOrNull("p", patientColumns, "phone", "phone")},
            ${addressLineSelect},
            ${trimmedColumnOrNull("p", patientColumns, "insurance", "insurance")},
            ${trimmedColumnOrNull("p", patientColumns, "insurance_id", "insuranceId")},
            ${trimmedColumnOrNull("p", patientColumns, "insurance_group_number", "insuranceGroupNumber")},
            ${allergiesSelect},
            coalesce(pr.full_name, 'Unassigned provider') as "providerName",
            l.name as "locationName",
            coalesce(at.name, 'Visit') as "appointmentTypeName",
            ${trimmedColumnOrNull("a", appointmentColumns, "reason", "reason")},
            ${chiefComplaintSelect},
            ${clinicalSnapshotSelect},
            ${medicationsSummarySelect},
            ${trimmedColumnOrNull("a", appointmentColumns, "notes", "notes")}
     from appointments a
     join patients p on p.id = a.patient_id
     left join providers pr on pr.id = a.provider_id
     left join locations l on l.id = a.location_id
     left join appointment_types at on at.id = a.appointment_type_id
     ${encounterJoin}
     ${visitSummaryJoin}
     ${prescriptionJoin}
     ${allergyJoin}
     where a.tenant_id = $1
       and a.location_id = $2
       and a.scheduled_start >= $3
       and a.scheduled_start < $4
     order by a.scheduled_start asc, a.id asc`,
    [tenantId, locationId, start, end],
  );

  return result.rows.map((row) => ({
    appointmentId: row.appointmentId,
    patientId: row.patientId,
    scheduledStart:
      row.scheduledStart instanceof Date
        ? row.scheduledStart.toISOString()
        : String(row.scheduledStart),
    scheduledEnd:
      row.scheduledEnd instanceof Date
        ? row.scheduledEnd.toISOString()
        : row.scheduledEnd
          ? String(row.scheduledEnd)
          : null,
    status: typeof row.status === "string" ? row.status : "scheduled",
    patientName: typeof row.patientName === "string" && row.patientName.trim()
      ? row.patientName.trim()
      : "Unknown patient",
    mrn: row.mrn ?? null,
    dob: row.dob ?? null,
    phone: row.phone ?? null,
    addressLine: row.addressLine ?? null,
    insurance: row.insurance ?? null,
    insuranceId: row.insuranceId ?? null,
    insuranceGroupNumber: row.insuranceGroupNumber ?? null,
    allergies: row.allergies ?? null,
    providerName: row.providerName,
    locationName: row.locationName ?? null,
    appointmentTypeName: row.appointmentTypeName,
    reason: row.reason ?? null,
    chiefComplaint: row.chiefComplaint ?? null,
    clinicalSnapshot: row.clinicalSnapshot ?? null,
    medicationsSummary: row.medicationsSummary ?? null,
    notes: row.notes ?? null,
  }));
}

function buildCounts(appointments: DowntimePacketAppointment[]): DowntimePacket["counts"] {
  const byStatus = appointments.reduce<Record<string, number>>((acc, appointment) => {
    const key = appointment.status || "scheduled";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    total: appointments.length,
    byStatus,
  };
}

export async function buildDowntimePacket(
  tenantId: string,
  locationId: string,
  dateInput?: string,
): Promise<DowntimePacket> {
  const location = await loadLocationForTenant(tenantId, locationId);
  if (!location) {
    throw new Error("Location not found");
  }

  const date = normalizePacketDate(dateInput);
  const settings = mapDowntimeSettings(location);
  const appointments = await loadAppointmentsForPacket(tenantId, locationId, date);

  return {
    date,
    generatedAt: new Date().toISOString(),
    location: {
      id: location.id,
      name: location.name,
      address: location.address ?? null,
      phone: location.phone ?? null,
    },
    settings,
    counts: buildCounts(appointments),
    appointments,
  };
}

export async function fetchStoredDowntimePacket(
  tenantId: string,
  locationId: string,
  dateInput?: string,
): Promise<DowntimePacket | null> {
  const date = normalizePacketDate(dateInput);
  const result = await pool.query(
    `select id,
            generated_at as "generatedAt",
            packet_payload as "packetPayload"
     from downtime_packets
     where tenant_id = $1
       and location_id = $2
       and packet_date = $3::date
     limit 1`,
    [tenantId, locationId, date],
  );

  if (!result.rowCount) {
    return null;
  }

  const row = result.rows[0] as StoredDowntimePacketRow;
  const payload = row.packetPayload;
  return {
    ...payload,
    generatedAt:
      typeof payload?.generatedAt === "string"
        ? payload.generatedAt
        : new Date(row.generatedAt).toISOString(),
  };
}

export async function generateAndStoreDowntimePacket(
  tenantId: string,
  locationId: string,
  dateInput?: string,
  source: "manual" | "automatic" | "scheduled" = "manual",
): Promise<{ packet: DowntimePacket; changed: boolean }> {
  const packet = await buildDowntimePacket(tenantId, locationId, dateInput);
  const existing = await fetchStoredDowntimePacket(tenantId, locationId, packet.date);

  if (existing && packetsMatch(existing, packet)) {
    return {
      packet: existing,
      changed: false,
    };
  }

  const payload: DowntimePacket = {
    ...packet,
    generatedAt: new Date().toISOString(),
  };

  await pool.query(
    `insert into downtime_packets (
       id,
       tenant_id,
       location_id,
       packet_date,
       packet_payload,
       source,
       generated_at
     )
     values ($1, $2, $3, $4::date, $5::jsonb, $6, $7)
     on conflict (tenant_id, location_id, packet_date) do update set
       packet_payload = excluded.packet_payload,
       source = excluded.source,
       generated_at = excluded.generated_at,
       updated_at = now()`,
    [
      randomUUID(),
      tenantId,
      locationId,
      payload.date,
      JSON.stringify(payload),
      source,
      payload.generatedAt,
    ],
  );

  return {
    packet: payload,
    changed: true,
  };
}

export async function prepareReadyDowntimePackets(now: Date = new Date()): Promise<PrepareReadyPacketsResult> {
  const locations = await loadAllEnabledLocations();
  let packetsPrepared = 0;
  let packetsReused = 0;
  let failures = 0;

  for (const location of locations) {
    const settings = mapDowntimeSettings(location);
    if (!hasReachedDowntimePacketCutoff(settings.packetTime, now)) {
      continue;
    }

    const packetDate = getTargetDowntimePacketDate(settings.packetTime, now);

    try {
      const result = await generateAndStoreDowntimePacket(
        location.tenantId,
        location.id,
        packetDate,
        "scheduled",
      );
      if (result.changed) {
        packetsPrepared += 1;
      } else {
        packetsReused += 1;
      }
    } catch (error) {
      failures += 1;
      logger.error("Failed to prepare downtime packet", {
        tenantId: location.tenantId,
        locationId: location.id,
        packetDate,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    locationsChecked: locations.length,
    packetsPrepared,
    packetsReused,
    failures,
  };
}
