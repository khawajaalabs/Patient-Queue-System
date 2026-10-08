import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createLocalApp } from "../app.ts";
import { createPostgresDatabase } from "../db/postgres.ts";

test("clinical workflow: global profiles, structured notes/vitals/prescriptions, atomic completion and private patient portal", async () => {
  const database = process.env["QUEUECARE_CLINICAL_TEST_SCHEMA"]
    ? await createPostgresDatabase(
        process.env["DATABASE_URL"]!,
        true,
        process.env["QUEUECARE_CLINICAL_TEST_SCHEMA"],
        () => {},
      )
    : undefined;
  const app = createLocalApp({ ...(database ? { database } : {}), log: () => {} });
  app.http.listen(0, "127.0.0.1");
  await once(app.http, "listening");
  const addr = app.http.address();
  assert.ok(addr && typeof addr !== "string");
  const port = addr.port;
  async function req(
    path: string,
    cookie = "",
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
  ) {
    const r = await fetch(`http://127.0.0.1:${port}/api` + path, {
      method,
      headers: { "Content-Type": "application/json", "X-QueueCare-Request": "1", Cookie: cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = await r.json();
    return {
      status: r.status,
      data: json.data,
      cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "",
    };
  }
  try {
    const admin = await req("/auth/login", "", {
      email: process.env["QUEUECARE_ADMIN_EMAIL"] ?? "admin@queuecare.local",
      password: process.env["QUEUECARE_ADMIN_PASSWORD"] ?? "QueueCareAdmin123!",
    });
    assert.equal(admin.status, 200);
    const patient = await req("/auth/register", "", {
      fullName: "Clinical Patient",
      email: "clinical@phase2.test",
      phone: "123456789",
      password: "PatientPassword123!",
    });
    const other = await req("/auth/register", "", {
      fullName: "Other Patient",
      email: "other@phase2.test",
      phone: "123456789",
      password: "PatientPassword123!",
    });
    const uid = patient.data.id;
    assert.equal((await req("/patient/profile", patient.cookie)).data.id, uid);
    const demographic = {
      fullName: "Clinical Updated",
      phone: "987654321",
      dateOfBirth: "1990-05-12",
      gender: "female",
      address: "Patient address",
      emergencyContactName: "Family",
      emergencyContactPhone: "123456789",
      bloodGroup: "O+",
    };
    assert.equal((await req("/patient/profile", patient.cookie, demographic, "PUT")).status, 200);
    assert.equal(
      (
        await req(
          "/patient/profile",
          patient.cookie,
          { ...demographic, allergies: "overwrite" },
          "PUT",
        )
      ).status,
      400,
    );
    assert.equal((await req("/patient/profile", patient.cookie)).data.fullName, "Clinical Updated");
    assert.equal((await req("/patient/profile", patient.cookie)).data.dateOfBirth, "1990-05-12");
    assert.equal(
      (
        await req(
          `/admin/patients/${uid}/clinical-profile`,
          admin.cookie,
          {
            allergies: "Penicillin",
            chronicConditions: "Doctor entered",
            currentMedications: "Existing medicine",
            generalNotes: "PRIVATE PROFILE NOTE",
          },
          "PUT",
        )
      ).status,
      200,
    );
    await req("/admin/queue/open", admin.cookie, {});
    const token = (await req("/patient/token", patient.cookie, { reason: "Review" })).data;
    await req("/admin/queue/call-next", admin.cookie, {});
    const start = { clinicId: "northstar", tokenId: token.id };
    const visit = (await req(`/admin/patients/${uid}/visits`, admin.cookie, start)).data;
    assert.equal(visit.status, "in_progress");
    assert.equal(
      (await req(`/admin/patients/${uid}/visits`, admin.cookie, start)).data.id,
      visit.id,
    );
    assert.equal((await req("/patient/visits", patient.cookie)).data.length, 0);
    const record = {
      reasonForVisit: "Review",
      chiefComplaint: "Patient complaint",
      historyNotes: "PRIVATE HISTORY",
      examinationNotes: "PRIVATE EXAM",
      diagnosis: "Recorded diagnosis",
      releaseDiagnosis: true,
      treatmentPlan: "Doctor treatment",
      followUpInstructions: "Return as advised",
      followUpDate: "2026-12-10",
      privateNotes: "PRIVATE DOCTOR NOTE",
      patientSummary: "Released visit summary",
      vitals: {
        systolic: 120,
        diastolic: 80,
        pulse: 72,
        temperature: 36.8,
        respiratoryRate: null,
        oxygenSaturation: 98,
        weight: 65.5,
        height: 170,
      },
      prescription: {
        instructions: "General prescription advice",
        items: [
          {
            medicine: "Free text medicine one",
            dose: "10 mg",
            frequency: "Daily",
            duration: "5 days",
            instructions: "Doctor advice",
          },
          {
            medicine: "Free text medicine two",
            dose: "One tablet",
            frequency: "Evening",
            duration: "3 days",
            instructions: "",
          },
        ],
      },
    };
    const path = `/admin/visits/${visit.id}`;
    assert.equal(
      (await req(path, admin.cookie, { ...record, vitals: { ...record.vitals, pulse: -1 } }, "PUT"))
        .status,
      400,
    );
    assert.equal((await req(path, admin.cookie, record, "PUT")).status, 200);
    const detail = (await req(path, admin.cookie)).data;
    assert.equal(detail.vitals.systolic, 120);
    assert.equal(detail.prescription.items.length, 2);
    assert.equal((await req("/admin/queue/complete", admin.cookie, {})).status, 409);
    const completed = await req(path + "/complete", admin.cookie, record);
    assert.equal(completed.status, 200);
    assert.equal((await req(path + "/complete", admin.cookie, record)).status, 200);
    assert.equal((await req(path, admin.cookie, record, "PUT")).status, 409);
    assert.equal((await req("/patient/state", patient.cookie)).data.mine.status, "completed");
    const released = (await req(`/patient/visits/${visit.id}`, patient.cookie)).data;
    assert.equal(released.patientSummary, "Released visit summary");
    assert.equal(released.diagnosis, "Recorded diagnosis");
    assert.equal(released.prescription.items.length, 2);
    assert.ok(!JSON.stringify(released).includes("PRIVATE"));
    assert.equal(released.privateNotes, undefined);
    assert.equal(released.vitals, undefined);
    assert.ok(
      !JSON.stringify((await req("/patient/profile", patient.cookie)).data).includes(
        "PRIVATE PROFILE",
      ),
    );
    assert.equal((await req(`/patient/visits/${visit.id}`, other.cookie)).status, 404);
    assert.equal(
      (await req(`/patient/visits/${visit.id}`, patient.cookie, record, "PUT")).status,
      403,
    );
    assert.equal((await req(path, patient.cookie, record, "PUT")).status, 403);
    assert.equal((await req("/patient/prescriptions", patient.cookie)).data.length, 1);
    const clinic = (
      await req("/admin/clinics", admin.cookie, {
        name: "Clinical branch",
        publicName: "Clinical branch",
        address: "Branch",
        phone: "123456789",
        department: "General",
        doctor: "Main Doctor",
        opening: "09:00",
        closing: "17:00",
        prefix: "B",
        showNext: true,
        avgMin: 5,
        active: true,
        consultationFee: null,
      })
    ).data;
    const appointment = (
      await req("/admin/appointments?clinicId=" + clinic.id, admin.cookie, {
        patientId: uid,
        scheduledAt: "2026-11-10T10:00",
        reason: "Follow-up",
      })
    ).data;
    const apptVisit = (
      await req(`/admin/patients/${uid}/visits`, admin.cookie, {
        clinicId: clinic.id,
        appointmentId: appointment.id,
      })
    ).data;
    assert.equal(apptVisit.appointmentId, appointment.id);
    const unreleased = {
      ...record,
      releaseDiagnosis: false,
      diagnosis: "NOT RELEASED",
      prescription: { instructions: "", items: [] },
    };
    assert.equal(
      (await req(`/admin/visits/${apptVisit.id}/complete`, admin.cookie, unreleased)).status,
      200,
    );
    assert.equal(
      (await req(`/patient/visits/${apptVisit.id}`, patient.cookie)).data.diagnosis,
      null,
    );
    assert.equal(
      (await req(`/patient/visits/${visit.id}`, patient.cookie)).data.followUpDate,
      record.followUpDate,
    );
    const overview = (await req(`/admin/patients/${uid}/record`, admin.cookie)).data;
    assert.equal(overview.visits.length, 2);
    assert.equal(new Set(overview.visits.map((v: { clinicId: string }) => v.clinicId)).size, 2);
    assert.equal((await req("/patient/visits", patient.cookie)).data.length, 2);
    assert.equal(
      (await req("/admin/appointments?clinicId=" + clinic.id, admin.cookie)).data[0].status,
      "completed",
    );
    assert.equal(
      (
        await req("/auth/login", "", {
          email: "clinical@phase2.test",
          password: "PatientPassword123!",
        })
      ).data.id,
      uid,
    );
  } finally {
    await app.close();
  }
});
import { createDatabase } from "../db/database.ts";
import { migrate } from "../db/migrations.ts";
test("additive clinical migration backfills existing patient profiles without changing original records", () => {
  const db = createDatabase(":memory:", () => {});
  try {
    const stamp = new Date().toISOString();
    db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?,?)").run(
      "legacy-patient",
      "Existing Patient",
      "legacy@phase2.test",
      "123456789",
      "existing-hash",
      "patient",
      stamp,
      stamp,
    );
    const original = JSON.stringify(db.prepare("SELECT * FROM users ORDER BY id").all());
    db.exec(
      "DROP TABLE audit_logs; DROP TABLE notifications; DROP TABLE payments; DROP TABLE invoice_items; DROP TABLE invoices; DROP TABLE patient_documents; DROP TABLE staff_clinics; DROP TABLE staff_profiles; DROP TABLE prescription_items; DROP TABLE prescriptions; DROP TABLE visit_vitals; DROP TABLE encounters; DROP TABLE patient_profiles; DROP INDEX appointments_identity_clinic; PRAGMA user_version=3;",
    );
    migrate(db);
    assert.equal(JSON.stringify(db.prepare("SELECT * FROM users ORDER BY id").all()), original);
    assert.equal(
      db.prepare("SELECT user_id FROM patient_profiles WHERE user_id=?").get("legacy-patient")?.[
        "user_id"
      ],
      "legacy-patient",
    );
  } finally {
    db.close();
  }
});
