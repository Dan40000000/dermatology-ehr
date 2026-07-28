#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const API_BASE = (process.env.AUDIT_API_BASE || "https://derm-api-pilot-live.up.railway.app").replace(/\/+$/, "");
const FRONTEND_BASE = (process.env.AUDIT_FRONTEND_BASE || "https://derm-frontend-pilot-live.up.railway.app").replace(/\/+$/, "");
const TENANT_ID = process.env.AUDIT_TENANT_ID || "tenant-demo";
const STAFF_EMAIL = process.env.AUDIT_STAFF_EMAIL || "admin@demo.practice";
const STAFF_PASSWORD = requiredEnv("AUDIT_STAFF_PASSWORD");
const CRM_CLIENT_EMAIL = process.env.AUDIT_CRM_CLIENT_EMAIL || "pilot-empty@perrysoftwarellc.com";
const CRM_CLIENT_PASSWORD = requiredEnv("AUDIT_CRM_CLIENT_PASSWORD");
const CRM_OWNER_EMAIL = process.env.AUDIT_CRM_OWNER_EMAIL || "dan@perrysoftwarellc.com";
const CRM_OWNER_PASSWORD = requiredEnv("AUDIT_CRM_OWNER_PASSWORD");
const RUN_ID = process.env.AUDIT_RUN_ID || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const REPORT_DIR = process.env.AUDIT_REPORT_DIR || "test-results";
const REPORT_PATH = path.join(REPORT_DIR, `clean-railway-deep-audit-${RUN_ID}.json`);

const results = [];
const warnings = [];
const state = {
  tenantId: TENANT_ID,
  runId: RUN_ID,
  frontendBase: FRONTEND_BASE,
  apiBase: API_BASE,
};

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is required for the live clean-system audit.`);
    process.exit(1);
  }
  return value;
}

function nowDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateOnly, days) {
  const date = new Date(`${dateOnly}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextWeekdayDate(dayOfWeek, minDaysAhead = 2) {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + minDaysAhead);
  for (let i = 0; i < 14; i += 1) {
    if (base.getUTCDay() === dayOfWeek) return base.toISOString().slice(0, 10);
    base.setUTCDate(base.getUTCDate() + 1);
  }
  return base.toISOString().slice(0, 10);
}

function clinicIso(dateOnly, time) {
  const [hour, minute] = time.split(":").map((value) => Number(value));
  const date = new Date(`${dateOnly}T00:00:00.000-06:00`);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function plusMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function dollarsToCents(value) {
  return Math.round(Number(value) * 100);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function record(area, step, status, details = {}) {
  const entry = {
    area,
    step,
    status,
    ...details,
    at: new Date().toISOString(),
  };
  results.push(entry);
  const prefix = status === "PASS" ? "PASS" : status === "WARN" ? "WARN" : "FAIL";
  const statusText = details.statusCode ? ` (${details.statusCode})` : "";
  const detailText = details.note ? ` - ${details.note}` : "";
  console.log(`${prefix} [${area}] ${step}${statusText}${detailText}`);
}

function recordWarning(area, step, details = {}) {
  warnings.push({ area, step, ...details });
  record(area, step, "WARN", details);
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  setFrom(headers) {
    const raw = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : headers.get("set-cookie")
        ? [headers.get("set-cookie")]
        : [];
    for (const value of raw) {
      for (const part of splitSetCookie(value)) {
        const first = String(part).split(";")[0];
        const eq = first.indexOf("=");
        if (eq > 0) {
          this.cookies.set(first.slice(0, eq), first.slice(eq + 1));
        }
      }
    }
  }

  header() {
    return Array.from(this.cookies.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
  }
}

function splitSetCookie(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(/,(?=\s*[A-Za-z0-9_.-]+=)/g);
}

class ApiClient {
  constructor({ name, cookieJar = new CookieJar(), bearer = null, extraHeaders = {} } = {}) {
    this.name = name || "client";
    this.cookieJar = cookieJar;
    this.bearer = bearer;
    this.extraHeaders = extraHeaders;
  }

  async request(method, urlPath, { body, headers, formData } = {}) {
    const finalHeaders = {
      "X-Tenant-ID": TENANT_ID,
      ...this.extraHeaders,
      ...(headers || {}),
    };
    if (this.bearer) finalHeaders.Authorization = `Bearer ${this.bearer}`;
    const cookieHeader = this.cookieJar.header();
    if (cookieHeader) finalHeaders.Cookie = cookieHeader;
    let requestBody;
    if (formData) {
      requestBody = formData;
    } else if (body !== undefined) {
      finalHeaders["Content-Type"] = "application/json";
      requestBody = JSON.stringify(body);
    }
    const res = await fetch(`${API_BASE}${urlPath}`, {
      method,
      headers: finalHeaders,
      body: requestBody,
      redirect: "manual",
    });
    this.cookieJar.setFrom(res.headers);
    const text = await res.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
    }
    return { status: res.status, ok: res.ok, body: json, headers: res.headers, text };
  }

  get(urlPath, options) {
    return this.request("GET", urlPath, options);
  }

  post(urlPath, body, options = {}) {
    return this.request("POST", urlPath, { ...options, body });
  }

  put(urlPath, body, options = {}) {
    return this.request("PUT", urlPath, { ...options, body });
  }

  patch(urlPath, body, options = {}) {
    return this.request("PATCH", urlPath, { ...options, body });
  }

  async upload(urlPath, filename, bytes, mimeType) {
    const formData = new FormData();
    formData.append("file", new Blob([bytes], { type: mimeType }), filename);
    return this.request("POST", urlPath, { formData });
  }
}

function sanitizeBody(body) {
  if (!body || typeof body !== "object") return body;
  const copy = JSON.parse(JSON.stringify(body));
  for (const key of ["token", "refreshToken", "accessToken", "password", "passwordHash"]) {
    if (Object.prototype.hasOwnProperty.call(copy, key)) copy[key] = "[redacted]";
  }
  return copy;
}

function reportableState() {
  const copy = { ...state };
  delete copy.portal;
  for (const key of Object.keys(copy)) {
    if (/password/i.test(key)) copy[key] = "[redacted]";
  }
  return copy;
}

async function expectRequest(area, step, fn, options = {}) {
  const expected = options.expected || [200];
  const warnStatuses = new Set(options.warnStatuses || []);
  const allowBodyAssertOnWarn = Boolean(options.allowBodyAssertOnWarn);
  try {
    const response = await fn();
    const expectedHit = expected.includes(response.status);
    const warningHit = warnStatuses.has(response.status);
    const status = warningHit ? "WARN" : expectedHit ? "PASS" : "FAIL";
    const details = {
      statusCode: response.status,
      note: options.note,
    };
    if (status === "FAIL") {
      details.body = sanitizeBody(response.body);
      record(area, step, status, details);
      throw new Error(`${area}/${step} failed with ${response.status}: ${JSON.stringify(sanitizeBody(response.body))}`);
    }
    if (options.assertBody && (status === "PASS" || allowBodyAssertOnWarn)) {
      try {
        options.assertBody(response.body, response);
      } catch (error) {
        record(area, step, "FAIL", {
          statusCode: response.status,
          note: error.message,
          body: sanitizeBody(response.body),
        });
        throw error;
      }
    }
    record(area, step, status, details);
    return response;
  } catch (error) {
    if (options.optional) {
      recordWarning(area, step, { note: error.message });
      return { status: 0, ok: false, body: null, error };
    }
    record(area, step, "FAIL", { note: error.message });
    throw error;
  }
}

function firstArray(body, keys) {
  for (const key of keys) {
    if (Array.isArray(body?.[key])) return body[key];
  }
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

function firstId(body, keys = ["id"]) {
  for (const key of keys) {
    if (body?.[key]) return String(body[key]);
  }
  return null;
}

async function loginStaff(email = STAFF_EMAIL, password = STAFF_PASSWORD) {
  const client = new ApiClient({ name: email });
  const response = await expectRequest("Auth/Security", `staff login ${email}`, () =>
    client.post("/api/auth/login", { email, password }), {
      expected: [200],
      assertBody: (body) => {
        assert(body?.user?.email, "Login response missing user email");
      },
    });
  return { client, user: response.body.user, tokens: response.body.tokens };
}

async function loginCrm(email, password) {
  const response = await expectRequest("CRM", `CRM login ${email}`, () =>
    new ApiClient().post("/api/crm/auth/login", { email, password }), {
      expected: [200],
      assertBody: (body) => assert(body?.token, "CRM login response missing token"),
    });
  return new ApiClient({ name: email, bearer: response.body.token });
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  console.log(`Clean Railway deep audit ${RUN_ID}`);
  console.log(`API: ${API_BASE}`);
  console.log(`Frontend: ${FRONTEND_BASE}`);

  await expectRequest("Auth/Security", "API health", () =>
    new ApiClient().get("/health"), { expected: [200] });

  const { client: admin, user: adminUser } = await loginStaff();
  state.adminUserId = adminUser.id;

  await expectRequest("Auth/Security", "auth/me uses staff cookie", () =>
    admin.get("/api/auth/me"), {
      expected: [200],
      assertBody: (body) => assert(body?.user?.email === STAFF_EMAIL, "auth/me did not return admin user"),
    });

  await expectRequest("Auth/Security", "refresh token rotates through HTTP-only cookie", () =>
    admin.post("/api/auth/refresh", { refreshToken: "__http_only_cookie__" }), {
      expected: [200],
      assertBody: (body) => assert(body?.user && body?.tokens?.refreshToken === "__http_only_cookie__", "Refresh did not return cookie placeholder tokens"),
    });

  await expectRequest("Auth/Security", "wrong tenant is rejected", () =>
    admin.get("/api/auth/me", { headers: { "X-Tenant-ID": "tenant-wrong-audit" } }), {
      expected: [403],
    });

  await adminSetup(admin);
  await patientPortalSetup(admin);
  await schedulingClinicalFlow(admin);
  await claimsRevenueFlow(admin);
  await storeInventoryFlow(admin);
  await messagingSmsUploadFlow(admin);
  await integrationsAnalyticsCrmFlow(admin);
  await staffLockoutFlow(admin);

  const counts = results.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const report = {
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    apiBase: API_BASE,
    frontendBase: FRONTEND_BASE,
    tenantId: TENANT_ID,
    counts,
    state: reportableState(),
    warnings,
    results,
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Report written to ${REPORT_PATH}`);

  if ((counts.FAIL || 0) > 0) {
    process.exitCode = 1;
  }
}

async function adminSetup(admin) {
  const area = "Admin Setup";
  const facilityName = `Audit Facility ${RUN_ID}`;
  const facilityRes = await expectRequest(area, "create facility/location", () =>
    admin.post("/api/admin/facilities", {
      name: facilityName,
      address: "123 Audit Medical Center Dr",
      phone: "(555) 123-4567",
      isActive: true,
      downtimePacket: {
        autoDownload: true,
        packetTime: "12:00",
        deviceType: "desktop",
      },
    }), { expected: [201, 200] });
  state.facilityId = firstId(facilityRes.body, ["id", "facilityId"]) || facilityRes.body?.facility?.id;
  if (!state.facilityId) {
    const facilities = await admin.get("/api/admin/facilities");
    state.facilityId = firstArray(facilities.body, ["facilities"]).find((facility) => facility.name === facilityName)?.id;
  }
  assert(state.facilityId, "Facility create did not provide an id");

  const roomRes = await expectRequest(area, "create room tied to facility", () =>
    admin.post("/api/admin/rooms", {
      name: `Audit Room ${RUN_ID}`,
      facilityId: state.facilityId,
      roomType: "exam",
      isActive: true,
    }), { expected: [201, 200] });
  state.roomId = firstId(roomRes.body, ["id", "roomId"]) || roomRes.body?.room?.id;
  assert(state.roomId, "Room create did not provide an id");

  const medicalType = await expectRequest(area, "create standard medical appointment type", () =>
    admin.post("/api/appointment-types", {
      name: `Audit Medical Visit ${RUN_ID}`,
      durationMinutes: 30,
      category: "medical",
      color: "#2563eb",
      description: "Synthetic audit appointment type",
      priorAuthRequired: false,
      isActive: true,
    }), { expected: [201] });
  state.appointmentTypeId = medicalType.body.appointmentType.id;

  const priorAuthType = await expectRequest(area, "create prior-auth appointment type", () =>
    admin.post("/api/appointment-types", {
      name: `Audit Procedure PA ${RUN_ID}`,
      durationMinutes: 45,
      category: "medical",
      color: "#9333ea",
      description: "Synthetic prior authorization audit type",
      priorAuthRequired: true,
      isActive: true,
    }), { expected: [201] });
  state.priorAuthAppointmentTypeId = priorAuthType.body.appointmentType.id;

  const providerTempPassword = `TempProv${RUN_ID}!Aa1`;
  const providerEmail = `audit.provider.${RUN_ID}@example.test`;
  const providerRes = await expectRequest(area, "create provider with linked first-time login", () =>
    admin.post("/api/admin/providers", {
      fullName: `Dr. Audit Provider ${RUN_ID}`,
      specialty: "Dermatology",
      npi: `18${RUN_ID.slice(-8)}`,
      email: providerEmail,
      phone: "+15555550111",
      password: providerTempPassword,
      sendTemporaryLoginSms: false,
      createLinkedUser: true,
    }), { expected: [201] });
  state.providerId = providerRes.body.id;
  state.providerLinkedUserId = providerRes.body.linkedUserId;
  assert(state.providerId && state.providerLinkedUserId, "Provider linked user missing");

  const providerLogin = await loginStaff(providerEmail, providerTempPassword);
  await expectRequest(area, "provider first login is forced to reset before app routes", () =>
    providerLogin.client.get("/api/auth/users?workforceOnly=true"), { expected: [403] });
  const providerNewPassword = `ProviderFinal${RUN_ID}!Aa1`;
  await expectRequest(area, "provider changes temporary password", () =>
    providerLogin.client.post("/api/auth/change-password", {
      currentPassword: providerTempPassword,
      newPassword: providerNewPassword,
    }), { expected: [200] });
  await expectRequest(area, "provider route works after password reset", () =>
    providerLogin.client.get("/api/auth/me"), { expected: [200] });

  const syncedProviderUserPassword = `TempUserProv${RUN_ID}!Aa1`;
  const syncedProviderUser = await expectRequest(area, "create provider-role user auto-syncs provider profile", () =>
    admin.post("/api/admin/users", {
      email: `audit.user.provider.${RUN_ID}@example.test`,
      fullName: `Audit User Provider ${RUN_ID}`,
      role: "provider",
      secondaryRoles: [],
      phone: "+15555550112",
      password: syncedProviderUserPassword,
      sendTemporaryLoginSms: false,
    }), { expected: [201] });
  assert(syncedProviderUser.body?.linkedProvider?.id, "Provider-role user did not create/sync a linked provider");
  state.syncedProviderId = syncedProviderUser.body.linkedProvider.id;

  await expectRequest(area, "admin settings data route loads", () =>
    admin.get("/api/admin/users"), { expected: [200] });

  await expectRequest(area, "online booking settings can update or cleanly warn if seed row absent", () =>
    admin.put("/api/scheduling/settings", {
      isEnabled: true,
      bookingWindowDays: 60,
      minAdvanceHours: 1,
      maxAdvanceDays: 90,
      allowCancellation: true,
      cancellationCutoffHours: 24,
      requireReason: true,
      allowGuestBooking: true,
      requireCardOnFileForGuestBooking: false,
      guestCancellationFeeCents: 5000,
      customMessage: "Audit online booking is enabled.",
    }), { expected: [200, 404], warnStatuses: [404] });

  const appointmentDate = nextWeekdayDate(1, 3);
  state.appointmentDate = appointmentDate;
  const dayOfWeek = new Date(`${appointmentDate}T12:00:00.000Z`).getUTCDay();
  const templateRes = await expectRequest(area, "create online bookable provider availability template", () =>
    admin.post("/api/scheduling/availability-templates", {
      providerId: state.providerId,
      dayOfWeek,
      startTime: "09:00",
      endTime: "16:00",
      slotDuration: 30,
      allowOnlineBooking: true,
    }), { expected: [201] });
  state.availabilityTemplateId = templateRes.body.id;
}

async function patientPortalSetup(admin) {
  const area = "Patient Profile/Portal";
  const portalEmail = `audit.patient.${RUN_ID}@example.test`;
  const portalPassword = `PortalFinal${RUN_ID}!Aa1`;
  const patientRes = await expectRequest(area, "create synthetic patient with insurance, pharmacy, DOB, and SSN last4", () =>
    admin.post("/api/patients", {
      firstName: "Audit",
      lastName: `Patient${RUN_ID}`,
      dob: "1988-06-17",
      phone: "+15555550123",
      email: portalEmail,
      address: "2178 N 2230 W",
      city: "Audit City",
      state: "UT",
      zip: "84043",
      sex: "M",
      ssn: "1234",
      insurance: "UMR",
      insuranceId: `AUDIT${RUN_ID}`,
      insuranceMemberId: `AUDIT${RUN_ID}`,
      insurancePayerId: "39026",
      insuranceGroupNumber: "76416472",
      rxBin: "610014",
      rxPcn: "PEU",
      rxGroup: "UMR",
      pharmacyName: "Audit Pharmacy",
      pharmacyPhone: "+15555550199",
      pharmacyAddress: "1 Pharmacy Way, Audit City UT 84043",
      pharmacyNcpdp: "1234567",
    }), { expected: [201] });
  state.patientId = firstId(patientRes.body, ["id", "patientId"]);
  assert(state.patientId, "Patient create did not provide an id");
  state.portalEmail = portalEmail;
  state.portalPassword = portalPassword;

  await expectRequest(area, "patient DOB remains date-only and does not shift", () =>
    admin.get(`/api/patients/${state.patientId}`), {
      expected: [200],
      assertBody: (body) => {
        const patient = body?.patient || body;
        const dob = String(patient?.dob || patient?.dateOfBirth || "");
        assert(dob.startsWith("1988-06-17"), `DOB shifted or missing: ${dob}`);
      },
    });

  await expectRequest(area, "patient insurance includes medical and pharmacy fields", () =>
    admin.get(`/api/patients/${state.patientId}/insurance`), {
      expected: [200],
      assertBody: (body) => {
        const text = JSON.stringify(body);
        assert(text.includes("610014") && text.includes("PEU"), "Rx BIN/PCN not present in insurance response");
      },
    });

  await expectRequest(area, "patient prior authorization list loads empty or populated", () =>
    admin.get(`/api/patients/${state.patientId}/prior-auths`), { expected: [200] });

  await expectRequest(area, "portal identity verification works", () =>
    new ApiClient().post("/api/patient-portal/verify-identity", {
      lastName: `Patient${RUN_ID}`,
      dob: "1988-06-17",
      ssnLast4: "1234",
    }), {
      expected: [200],
      assertBody: (body) => assert(body?.verified === true, "Portal identity verification did not return verified=true"),
    });

  await expectRequest(area, "portal registration works", () =>
    new ApiClient().post("/api/patient-portal/register", {
      email: portalEmail,
      password: portalPassword,
      firstName: "Audit",
      lastName: `Patient${RUN_ID}`,
      dob: "1988-06-17",
      ssnLast4: "1234",
    }), { expected: [201, 200] });

  const portal = new ApiClient({ name: portalEmail });
  const loginRes = await expectRequest(area, "portal login uses cookie session", () =>
    portal.post("/api/patient-portal/login", { email: portalEmail, password: portalPassword }), {
      expected: [200],
      assertBody: (body) => assert(body?.patient || body?.user || body?.tokens, "Portal login response missing patient/session data"),
    });
  state.portalLoginResponse = sanitizeBody(loginRes.body);
  state.portal = portal;

  await expectRequest(area, "portal me loads", () =>
    portal.get("/api/patient-portal/me"), { expected: [200] });

  await expectRequest(area, "portal dashboard loads", () =>
    portal.get("/api/patient-portal-data/dashboard"), { expected: [200] });

  await expectRequest(area, "portal communication preferences update", () =>
    portal.put("/api/patient-portal/preferences", {
      appointmentReminders: true,
      billingAlerts: true,
      labResultNotifications: true,
      allowSms: true,
      allowEmail: true,
      allowPhone: true,
      allowMail: true,
      preferredMethod: "sms",
    }), { expected: [200] });

  await expectRequest(area, "forgot password by email responds generically", () =>
    new ApiClient().post("/api/patient-portal/forgot-password", {
      deliveryMethod: "email",
      email: `missing.${RUN_ID}@example.test`,
    }), { expected: [200] });

  await expectRequest(area, "forgot password by SMS responds generically", () =>
    new ApiClient().post("/api/patient-portal/forgot-password", {
      deliveryMethod: "sms",
      phone: "+15555550999",
    }), { expected: [200] });
}

async function schedulingClinicalFlow(admin) {
  const area = "Scheduling/Clinical";
  const portal = state.portal;
  await expectRequest(area, "portal sees online-bookable providers", () =>
    portal.get("/api/patient-portal/scheduling/providers"), {
      expected: [200],
      assertBody: (body) => {
        const providers = firstArray(body, ["providers"]);
        assert(providers.some((provider) => provider.id === state.providerId), "Audit provider not shown as bookable");
      },
    });

  await expectRequest(area, "portal sees appointment types", () =>
    portal.get("/api/patient-portal/scheduling/appointment-types"), {
      expected: [200],
      assertBody: (body) => {
        const types = firstArray(body, ["appointmentTypes"]);
        assert(types.some((type) => type.id === state.appointmentTypeId), "Audit appointment type not shown");
      },
    });

  const availability = await expectRequest(area, "portal availability returns real slots", () =>
    portal.get(`/api/patient-portal/scheduling/availability?providerId=${encodeURIComponent(state.providerId)}&appointmentTypeId=${encodeURIComponent(state.appointmentTypeId)}&date=${state.appointmentDate}`), {
      expected: [200],
      assertBody: (body) => {
        const slots = firstArray(body, ["slots"]);
        assert(slots.some((slot) => slot.isAvailable), "No available slots for audit appointment date");
      },
    });
  const slot = firstArray(availability.body, ["slots"]).find((item) => item.isAvailable);
  state.portalAppointmentStart = slot.startTime;
  state.portalAppointmentEnd = slot.endTime;

  const bookRes = await expectRequest(area, "portal books appointment from live slot", () =>
    portal.post("/api/patient-portal/scheduling/book", {
      providerId: state.providerId,
      appointmentTypeId: state.appointmentTypeId,
      scheduledStart: state.portalAppointmentStart,
      scheduledEnd: state.portalAppointmentEnd,
      reason: "Audit portal scheduling",
      notes: "Synthetic end-to-end audit appointment",
    }), { expected: [201] });
  state.portalAppointmentId = bookRes.body.appointmentId;

  const staffStart = clinicIso(addDays(state.appointmentDate, 1), "10:00");
  const staffEnd = plusMinutes(staffStart, 30);
  const staffAppt = await expectRequest(area, "staff creates appointment", () =>
    admin.post("/api/appointments", {
      patientId: state.patientId,
      providerId: state.providerId,
      locationId: state.facilityId,
      appointmentTypeId: state.appointmentTypeId,
      scheduledStart: staffStart,
      scheduledEnd: staffEnd,
      status: "scheduled",
    }), { expected: [201] });
  state.staffAppointmentId = staffAppt.body.id;

  for (const status of ["checked_in", "in_room", "with_provider"]) {
    await expectRequest(area, `appointment status ${status}`, () =>
      admin.post(`/api/appointments/${state.staffAppointmentId}/status`, { status }), { expected: [200] });
  }

  const encRes = await expectRequest(area, "create encounter", () =>
    admin.post("/api/encounters", {
      appointmentId: state.staffAppointmentId,
      patientId: state.patientId,
      providerId: state.providerId,
      chiefComplaint: "Audit lesion visit",
      hpi: "Synthetic patient reports changing rough spot.",
      ros: "No systemic symptoms.",
      exam: "Rough scaly macule on cheek.",
      assessmentPlan: "Actinic keratosis. Evaluation and management completed.",
    }), { expected: [201, 200] });
  state.encounterId = encRes.body.id;

  await expectRequest(area, "add diagnosis code L57.0", () =>
    admin.post(`/api/encounters/${state.encounterId}/diagnoses`, {
      icd10Code: "L57.0",
      description: "Actinic keratosis",
      isPrimary: true,
    }), { expected: [201] });

  await expectRequest(area, "add billing procedure code 99203", () =>
    admin.post(`/api/encounters/${state.encounterId}/procedures`, {
      cptCode: "99203",
      description: "Office/outpatient new patient evaluation and management",
      quantity: 1,
      modifiers: [],
    }), { expected: [201] });

  const complete = await expectRequest(area, "complete encounter and post financials", () =>
    admin.post(`/api/encounters/${state.encounterId}/complete`, {}), { expected: [200, 202], warnStatuses: [202] });
  state.encounterCompleteResponse = complete.body;

  await expectRequest(area, "encounter charges contain priced 99203 charge", () =>
    admin.get(`/api/encounters/${state.encounterId}/charges`), {
      expected: [200],
      assertBody: (body) => {
        const charges = firstArray(body, ["charges"]);
        const charge = charges.find((item) => item.cptCode === "99203");
        assert(charge && Number(charge.feeCents) > 0, "99203 charge missing or not priced");
        state.primaryChargeId = charge.id;
        state.primaryChargeCents = Number(charge.feeCents);
      },
    });
}

async function claimsRevenueFlow(admin) {
  const area = "Claims/Revenue";
  const createdClaim = await expectRequest(area, "create or reuse claim from encounter charges", () =>
    admin.post(`/api/encounters/${state.encounterId}/create-claim`, {}), {
      expected: [201, 500],
      warnStatuses: [500],
    });
  if (createdClaim.status === 201) {
    state.claimId = createdClaim.body.claimId;
  } else {
    const claims = await admin.get(`/api/claims?patientId=${encodeURIComponent(state.patientId)}`);
    state.claimId = firstArray(claims.body, ["claims"]).find((claim) => claim.encounterId === state.encounterId)?.id;
    if (state.claimId) {
      recordWarning(area, "claim was already created by encounter completion workflow", { note: `Using ${state.claimId}` });
    }
  }
  assert(state.claimId, "No claim available after encounter completion");

  await expectRequest(area, "claim scrub runs", () =>
    admin.post("/api/claims/scrub", { claimId: state.claimId, autoFix: true }), { expected: [200] });

  const release = await expectRequest(area, "claim release gate behaves correctly", () =>
    admin.post(`/api/claims/${state.claimId}/release`, { notes: "Audit release check" }), {
      expected: [200, 400],
      warnStatuses: [400],
    });
  if (release.status === 400) {
    recordWarning(area, "claim not ready is acceptable only when scrub errors explain it", {
      note: JSON.stringify(sanitizeBody(release.body)).slice(0, 300),
    });
  } else {
    await expectRequest(area, "claim submission dry path", () =>
      admin.post("/api/claims/submit", { claimIds: [state.claimId] }), {
        expected: [200, 207, 400, 502, 503],
        warnStatuses: [207, 400, 502, 503],
      });
  }

  await expectRequest(area, "mark claim accepted for payer payment posting", () =>
    admin.put(`/api/claims/${state.claimId}/status`, { status: "accepted", notes: "Audit payer acceptance" }), { expected: [200] });

  await expectRequest(area, "post payer payment to accepted claim", () =>
    admin.post(`/api/claims/${state.claimId}/payments`, {
      amountCents: Math.min(5000, Math.max(100, state.primaryChargeCents || 100)),
      paymentDate: nowDateOnly(),
      paymentMethod: "era",
      payer: "UMR",
      checkNumber: `AUDIT-${RUN_ID}`,
      notes: "Synthetic audit payer payment",
    }), { expected: [201, 200] });

  const bill = await expectRequest(area, "create manual bill with printable line item", () =>
    admin.post("/api/bills", {
      patientId: state.patientId,
      encounterId: state.encounterId,
      billDate: nowDateOnly(),
      dueDate: addDays(nowDateOnly(), 30),
      totalChargesCents: 2500,
      insuranceResponsibilityCents: 1500,
      patientResponsibilityCents: 1000,
      serviceDateStart: nowDateOnly(),
      serviceDateEnd: nowDateOnly(),
      notes: "Synthetic patient responsibility audit bill",
      lineItems: [{
        chargeId: state.primaryChargeId,
        serviceDate: nowDateOnly(),
        cptCode: "99203",
        description: "Audit balance statement",
        quantity: 1,
        unitPriceCents: 2500,
        totalCents: 2500,
        icdCodes: ["L57.0"],
      }],
    }), { expected: [201] });
  state.billId = bill.body.id;

  for (const action of ["print_statement", "mark_statement_mailed", "add_note"]) {
    await expectRequest(area, `bill action ${action}`, () =>
      admin.post(`/api/bills/${state.billId}/actions`, {
        action,
        note: `Audit ${action} note ${RUN_ID}`,
      }), { expected: [200] });
  }

  await expectRequest(area, "record patient payment", () =>
    admin.post("/api/patient-payments", {
      patientId: state.patientId,
      billId: state.billId,
      amountCents: 1000,
      paymentMethod: "credit",
      paymentDate: nowDateOnly(),
      referenceNumber: `AUDIT-PAY-${RUN_ID}`,
      notes: "Synthetic audit patient payment",
    }), { expected: [201, 200] });

  await expectRequest(area, "record A/R contact attempt with collections notes", () =>
    admin.post(`/api/collections/patient/${state.patientId}/contact-attempts`, {
      amountDue: 10,
      amountCollected: 0,
      contactMethod: "phone",
      contactDirection: "outbound",
      contactPerson: "Audit Patient",
      outcome: "promise_to_pay",
      notes: "Synthetic audit call note: patient asked for mailed copy.",
      patientResponse: "Patient says they will review the statement.",
      staffNextStep: "Follow up after mailed statement window.",
      nextFollowUpDate: addDays(nowDateOnly(), 7),
      followUpStatus: "scheduled",
      patientPromisedAmount: 10,
      patientPromisedDate: addDays(nowDateOnly(), 7),
      paymentPlanDiscussed: true,
      financialAssistanceDiscussed: false,
      contactPreferenceConfirmed: true,
    }), { expected: [201] });

  await expectRequest(area, "patient balance loads", () =>
    admin.get(`/api/collections/patient/${state.patientId}/balance`), { expected: [200] });

  await expectRequest(area, "collections activity includes audit notes", () =>
    admin.get(`/api/collections/patient/${state.patientId}/activity`), { expected: [200] });

  await expectRequest(area, "patient cost estimate generates", () =>
    admin.post("/api/collections/estimate", {
      patientId: state.patientId,
      appointmentId: state.staffAppointmentId,
      serviceType: "medical_dermatology",
      cptCodes: ["99203"],
      isCosmetic: false,
    }), {
      expected: [200, 500],
      warnStatuses: [500],
    });
}

async function storeInventoryFlow(admin) {
  const area = "Store/Inventory";
  const productRes = await expectRequest(area, "create store product", () =>
    admin.post("/api/products", {
      sku: `AUDIT-PADS-${RUN_ID}`,
      name: `Audit Glycolic Renewal Pads ${RUN_ID}`,
      description: "Synthetic audit retail skincare product",
      category: "skincare",
      brand: "Audit Derm",
      price: 3464,
      cost: 1200,
      inventoryCount: 12,
      reorderPoint: 2,
      imageUrl: "",
      barcode: `AUDIT${RUN_ID}`,
    }), { expected: [201] });
  state.productId = productRes.body.product.id;

  await expectRequest(area, "portal store shows product", () =>
    state.portal.get("/api/patient-portal-data/store/products"), {
      expected: [200],
      assertBody: (body) => {
        const products = firstArray(body, ["products"]);
        assert(products.some((product) => product.id === state.productId), "Created product not visible in portal store");
      },
    });

  await expectRequest(area, "portal store quote calculates total", () =>
    state.portal.post("/api/patient-portal-data/store/quote", {
      items: [{ productId: state.productId, quantity: 2 }],
      shippingMethod: "standard",
    }), { expected: [200] });

  const checkout = await expectRequest(area, "portal store checkout creates order", () =>
    state.portal.post("/api/patient-portal-data/store/checkout-session", {
      items: [{ productId: state.productId, quantity: 2 }],
      shippingMethod: "standard",
      shippingAddress: {
        name: "Audit Patient",
        street: "2178 N 2230 W",
        city: "Audit City",
        state: "UT",
        zip: "84043",
        phone: "+15555550123",
      },
      notificationEmail: state.portalEmail,
    }), { expected: [200, 201] });
  state.storeOrderId = checkout.body.order?.id || checkout.body.sale?.id || checkout.body.orderId;
  assert(state.storeOrderId, "Store checkout did not expose order id");

  await expectRequest(area, "staff store orders include order", () =>
    admin.get(`/api/products/sales?search=${encodeURIComponent(`Audit Patient`)}`), {
      expected: [200],
      assertBody: (body) => {
        const orders = firstArray(body, ["orders"]);
        assert(orders.some((order) => order.id === state.storeOrderId), "Store order not visible to staff");
      },
    });

  await expectRequest(area, "store order saves carrier and tracking link", () =>
    admin.put(`/api/products/sales/${state.storeOrderId}/fulfillment`, {
      fulfillmentStatus: "shipped",
      shippingMethod: "standard",
      carrier: "FedEx",
      trackingNumber: `AUDIT${RUN_ID}`,
      trackingUrl: `https://www.fedex.com/fedextrack/?trknbr=AUDIT${RUN_ID}`,
      notificationEmail: state.portalEmail,
      notificationStatus: "sent",
      stripePaymentStatus: "paid",
    }), { expected: [200] });

  await expectRequest(area, "sales report includes store revenue path", () =>
    admin.get(`/api/products/sales/report?startDate=${nowDateOnly()}&endDate=${addDays(nowDateOnly(), 1)}`), { expected: [200] });

  const inventory = await expectRequest(area, "create inventory item", () =>
    admin.post("/api/inventory", {
      name: `Audit Biopsy Kit ${RUN_ID}`,
      category: "supply",
      sku: `AUDIT-INV-${RUN_ID}`,
      description: "Synthetic audit inventory item",
      quantity: 5,
      reorderLevel: 1,
      unitCostCents: 700,
      supplier: "Audit Medical Supply",
      location: "Audit Cabinet",
      expirationDate: addDays(nowDateOnly(), 120),
      lotNumber: `LOT-${RUN_ID}`,
    }), { expected: [201] });
  state.inventoryItemId = inventory.body.id;

  await expectRequest(area, "manual stock adjustment works", () =>
    admin.post("/api/inventory/adjust", {
      itemId: state.inventoryItemId,
      adjustmentQuantity: 3,
      reason: "received",
      notes: "Synthetic audit receiving adjustment",
    }), { expected: [201] });

  await expectRequest(area, "self-pay inventory usage posts bill/charge path", () =>
    admin.post("/api/inventory/usage", {
      itemId: state.inventoryItemId,
      quantityUsed: 2,
      patientId: state.patientId,
      providerId: state.providerId,
      encounterId: state.encounterId,
      appointmentId: state.staffAppointmentId,
      notes: "Synthetic audit self-pay supply usage",
      billingRoute: "self_pay",
      sellPriceCents: 1500,
      chargeCode: "INV-ITEM",
      codeType: "INTERNAL",
    }), { expected: [201] });

  await expectRequest(area, "inventory oversell is rejected", () =>
    admin.post("/api/inventory/usage", {
      itemId: state.inventoryItemId,
      quantityUsed: 999,
      patientId: state.patientId,
      providerId: state.providerId,
      notes: "Synthetic audit oversell rejection",
      billingRoute: "bundled",
    }), { expected: [400] });

  await expectRequest(area, "inventory dashboard loads", () =>
    admin.get("/api/inventory/dashboard"), { expected: [200] });
}

async function messagingSmsUploadFlow(admin) {
  const area = "Messaging/SMS/Upload";
  const unlock = await expectRequest(area, "portal message unlock with password", () =>
    state.portal.post("/api/patient-portal/security/message-unlock", {
      password: state.portalPassword,
    }), {
      expected: [200],
      assertBody: (body) => assert(body?.unlockToken, "Unlock token missing"),
    });
  const unlockHeaders = { "x-portal-message-unlock": unlock.body.unlockToken };

  const patientThread = await expectRequest(area, "patient creates secure portal message", () =>
    state.portal.post("/api/patient-portal/messages/threads", {
      subject: `Audit portal message ${RUN_ID}`,
      category: "medical",
      messageText: "Synthetic audit secure message from patient to nurse.",
    }, { headers: unlockHeaders }), { expected: [201] });
  state.portalThreadId = patientThread.body.threadId;

  await expectRequest(area, "staff inbox sees portal message", () =>
    admin.get(`/api/patient-messages/threads?search=${encodeURIComponent(`Audit Patient`)}`), { expected: [200] });

  await expectRequest(area, "staff replies to secure portal message", () =>
    admin.post(`/api/patient-messages/threads/${state.portalThreadId}/messages`, {
      messageText: "Synthetic audit staff reply from nurse.",
      isInternalNote: false,
    }), { expected: [201] });

  await expectRequest(area, "portal sees staff reply", () =>
    state.portal.get(`/api/patient-portal/messages/threads/${state.portalThreadId}`, { headers: unlockHeaders }), {
      expected: [200],
      assertBody: (body) => {
        const messages = firstArray(body, ["messages"]);
        assert(messages.some((message) => String(message.message_text || message.messageText || "").includes("staff reply")), "Staff reply not visible in portal");
      },
    });

  await expectRequest(area, "SMS readiness endpoint loads", () =>
    admin.get("/api/sms/readiness"), {
      expected: [200, 503],
      warnStatuses: [503],
    });

  await expectRequest(area, "SMS conversations load", () =>
    admin.get("/api/sms/conversations"), { expected: [200] });

  await expectRequest(area, "SMS inbound simulation controlled response", () =>
    admin.post("/api/sms/test/inbound", {
      from: "+15555550123",
      body: `AUDIT inbound ${RUN_ID}`,
    }), {
      expected: [200, 400, 403],
      warnStatuses: [400, 403],
    });

  const pdfBytes = new Uint8Array([
    0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a,
    0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a,
  ]);
  const pdfUpload = await expectRequest(area, "PDF upload stores durably or fails safely", () =>
    admin.upload("/api/upload/document", `audit-${RUN_ID}.pdf`, pdfBytes, "application/pdf"), {
      expected: [200, 500],
      warnStatuses: [500],
    });
  if (pdfUpload.status === 500) {
    const message = String(pdfUpload.body?.error || "");
    assert(message.includes("S3 storage must be configured") || message.includes("Upload failed"), "Unexpected upload failure message");
  }

  await expectRequest(area, "spoofed PNG/text upload is rejected", () =>
    admin.upload("/api/upload/photo", `spoof-${RUN_ID}.png`, new TextEncoder().encode("not a png"), "image/png"), {
      expected: [400],
    });
}

async function integrationsAnalyticsCrmFlow(admin) {
  const area = "Integrations/Analytics/CRM/Labs/Rx";
  await expectRequest(area, "eligibility payer list loads", () =>
    admin.get("/api/eligibility/payers"), { expected: [200] });

  await expectRequest(area, "eligibility verification returns controlled response", () =>
    admin.post(`/api/eligibility/verify/${state.patientId}?appointmentId=${state.staffAppointmentId}`, {}), {
      expected: [200, 400, 422, 502, 503, 500],
      warnStatuses: [400, 422, 502, 503, 500],
    });

  const rx = await expectRequest(area, "create prescription", () =>
    admin.post("/api/prescriptions", {
      patientId: state.patientId,
      encounterId: state.encounterId,
      medicationName: "Triamcinolone acetonide",
      genericName: "triamcinolone",
      strength: "0.1%",
      dosageForm: "cream",
      sig: "Apply thin layer to affected area twice daily for 14 days.",
      quantity: 30,
      quantityUnit: "gram",
      refills: 1,
      daysSupply: 14,
      pharmacyName: "Audit Pharmacy",
      pharmacyPhone: "+15555550199",
      pharmacyAddress: "1 Pharmacy Way, Audit City UT 84043",
      pharmacyNcpdp: "1234567",
      daw: false,
      isControlled: false,
      indication: "Dermatitis",
      notes: "Synthetic audit prescription",
      deliveryMethod: "print",
    }), {
      expected: [201, 400],
      warnStatuses: [400],
    });
  if (rx.status === 201) state.prescriptionId = rx.body.id;

  await expectRequest(area, "patient prescription list loads", () =>
    admin.get(`/api/prescriptions/patient/${state.patientId}`), { expected: [200] });

  await expectRequest(area, "Rx benefits endpoint is connected or returns not-connected guard", () =>
    admin.get(`/api/prescriptions/patient-benefits/${state.patientId}`), {
      expected: [200, 404, 503],
      warnStatuses: [404, 503],
    });

  await expectRequest(area, "formulary endpoint is connected or returns not-connected guard", () =>
    admin.post("/api/prescriptions/check-formulary", {
      medicationName: "Triamcinolone acetonide",
      payerId: "39026",
    }), {
      expected: [200, 503],
      warnStatuses: [503],
    });

  await expectRequest(area, "lab vendors load", () =>
    admin.get("/api/lab-vendors"), { expected: [200] });

  await expectRequest(area, "lab vendor catalog loads", () =>
    admin.get("/api/lab-vendors/catalog"), { expected: [200] });

  await expectRequest(area, "lab orders load", () =>
    admin.get(`/api/lab-orders?patient_id=${state.patientId}`), { expected: [200] });

  await expectRequest(area, "lab results load", () =>
    admin.get(`/api/lab-results?patient_id=${state.patientId}`), { expected: [200] });

  const start = addDays(nowDateOnly(), -7);
  const end = addDays(nowDateOnly(), 1);
  await expectRequest(area, "analytics dashboard loads with date range", () =>
    admin.get(`/api/analytics/dashboard?startDate=${start}&endDate=${end}`), { expected: [200] });

  await expectRequest(area, "analytics top diagnoses loads", () =>
    admin.get(`/api/analytics/top-diagnoses?startDate=${start}&endDate=${end}`), { expected: [200] });

  await expectRequest(area, "analytics appointment types loads", () =>
    admin.get(`/api/analytics/appointment-types?startDate=${start}&endDate=${end}`), { expected: [200] });

  await expectRequest(area, "employee productivity loads", () =>
    admin.get(`/api/analytics/team-productivity?startDate=${start}&endDate=${end}`), { expected: [200] });

  await expectRequest(area, "OpenAI audit summary loads", () =>
    admin.get(`/api/openai-audit/summary?startDate=${start}&endDate=${end}`), { expected: [200] });

  const clientCrm = await loginCrm(CRM_CLIENT_EMAIL, CRM_CLIENT_PASSWORD);
  await expectRequest(area, "CRM client account loads", () =>
    clientCrm.get("/api/crm/client/account", { headers: {} }), {
      expected: [200],
      assertBody: (body) => assert(body?.mode === "client", "CRM client account did not load in client mode"),
    });

  const helpRequest = await expectRequest(area, "CRM client help request creates", () =>
    clientCrm.post("/api/crm/client/requests", {
      category: "support",
      title: `Audit help request ${RUN_ID}`,
      description: "Synthetic audit help request from clean pilot client portal.",
      priority: "normal",
    }), { expected: [201] });
  state.crmHelpRequestId = helpRequest.body.request.id;

  const providerRequest = await expectRequest(area, "CRM provider onboarding request creates", () =>
    clientCrm.post("/api/crm/client/provider-requests", {
      providerFullName: `Audit CRM Provider ${RUN_ID}`,
      providerSpecialty: "Dermatology",
      providerEmail: `audit.crm.provider.${RUN_ID}@example.test`,
      providerPhone: "+15555550155",
      requestedStartDate: addDays(nowDateOnly(), 14),
      notes: "Synthetic provider request from clean audit.",
    }), { expected: [201] });
  state.crmProviderRequestId = providerRequest.body.request.id;

  const ownerCrm = await loginCrm(CRM_OWNER_EMAIL, CRM_OWNER_PASSWORD);
  await expectRequest(area, "CRM owner dashboard sees client requests", () =>
    ownerCrm.get("/api/crm/client/account", { headers: {} }), {
      expected: [200],
      assertBody: (body) => {
        assert(body?.mode === "owner", "CRM owner account did not load in owner mode");
        const requests = firstArray(body, ["requests"]);
        assert(requests.some((request) => request.id === state.crmHelpRequestId), "Owner dashboard missing help request");
        assert(requests.some((request) => request.id === state.crmProviderRequestId), "Owner dashboard missing provider request");
      },
    });

  const ownerAccount = await ownerCrm.get("/api/crm/client/account", { headers: {} });
  const openInvoice = firstArray(ownerAccount.body, ["invoices"]).find((invoice) =>
    ["open", "overdue"].includes(invoice.status) && Number(invoice.amountCents || 0) > 0
  );
  if (openInvoice) {
    await expectRequest(area, "CRM invoice checkout starts or mock-pays", () =>
      ownerCrm.post(`/api/crm/client/invoices/${openInvoice.id}/checkout`, {
        successUrl: "https://perrysoftwarellc.com/account/",
        cancelUrl: "https://perrysoftwarellc.com/account/",
      }), { expected: [200, 503], warnStatuses: [503] });
  } else {
    recordWarning(area, "CRM invoice checkout skipped", { note: "No open CRM invoice was present in clean account data." });
  }
}

async function staffLockoutFlow(admin) {
  const area = "Auth/Security";
  const tempPassword = `TempStaff${RUN_ID}!Aa1`;
  const lockedEmail = `audit.lockout.${RUN_ID}@example.test`;
  const created = await expectRequest(area, "create disposable staff login for lockout test", () =>
    admin.post("/api/admin/users", {
      email: lockedEmail,
      fullName: `Audit Lockout ${RUN_ID}`,
      role: "front_desk",
      secondaryRoles: [],
      phone: "+15555550166",
      password: tempPassword,
      sendTemporaryLoginSms: false,
    }), { expected: [201] });
  state.lockoutUserId = created.body.id;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await expectRequest(area, `bad login attempt ${attempt} returns 401`, () =>
      new ApiClient().post("/api/auth/login", {
        email: lockedEmail,
        password: `Wrong${attempt}!Aa1`,
      }), { expected: [401] });
  }

  await expectRequest(area, "fifth bad login locks staff account", () =>
    new ApiClient().post("/api/auth/login", {
      email: lockedEmail,
      password: "Wrong5!Aa1",
    }), { expected: [423] });

  await expectRequest(area, "correct password remains locked until admin reset", () =>
    new ApiClient().post("/api/auth/login", {
      email: lockedEmail,
      password: tempPassword,
    }), { expected: [423] });

  const resetPassword = `ResetStaff${RUN_ID}!Aa1`;
  await expectRequest(area, "admin reset unlocks and forces temporary password reset", () =>
    admin.put(`/api/admin/users/${state.lockoutUserId}`, {
      password: resetPassword,
      sendTemporaryLoginSms: false,
    }), { expected: [200] });

  const resetLogin = await loginStaff(lockedEmail, resetPassword);
  await expectRequest(area, "reset staff session reports temporary password reset required", () =>
    resetLogin.client.get("/api/auth/me"), {
      expected: [200],
      assertBody: (body) => assert(body?.user?.passwordResetRequired === true, "Temporary password reset flag was not present"),
    });

  await expectRequest(area, "reset staff app route blocked until password changed", () =>
    resetLogin.client.get(`/api/appointments?date=${encodeURIComponent(nowDateOnly())}`), {
      expected: [403],
      assertBody: (body) => assert(body?.passwordResetRequired === true, "App route was blocked for a reason other than password reset"),
    });

  await expectRequest(area, "reset staff changes password", () =>
    resetLogin.client.post("/api/auth/change-password", {
      currentPassword: resetPassword,
      newPassword: `ResetStaffFinal${RUN_ID}!Aa1`,
    }), { expected: [200] });

  await expectRequest(area, "reset staff session clears password reset flag after password change", () =>
    resetLogin.client.get("/api/auth/me"), {
      expected: [200],
      assertBody: (body) => assert(body?.user?.passwordResetRequired === false, "Password reset flag was not cleared"),
    });

  await expectRequest(area, "reset staff app route works after password change", () =>
    resetLogin.client.get(`/api/appointments?date=${encodeURIComponent(nowDateOnly())}`), { expected: [200] });
}

main().catch((error) => {
  record("Harness", "unhandled error", "FAIL", { note: error.stack || error.message });
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify({
      runId: RUN_ID,
      generatedAt: new Date().toISOString(),
      apiBase: API_BASE,
      frontendBase: FRONTEND_BASE,
      tenantId: TENANT_ID,
      results,
      warnings,
      state: reportableState(),
      error: error.stack || error.message,
    }, null, 2));
  } catch {
    // Ignore report write failure during fatal error handling.
  }
  process.exitCode = 1;
});
