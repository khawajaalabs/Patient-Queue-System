import { testDoctorHours } from "./availability-fixture.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createLocalApp } from "../app.ts";
import { createPostgresDatabase } from "../db/postgres.ts";
import type { DocumentStorage } from "../services/document-storage.ts";
test(
  "Phase 3: staff clinic boundaries, preparation, private documents, atomic billing, notifications and audit",
  { timeout: 180000 },
  async () => {
    const files = new Map<string, Uint8Array>();
    const storage: DocumentStorage = {
      async uploadUrl(path) {
        return "memory://" + path;
      },
      async read(path) {
        const file = files.get(path);
        if (!file) throw Error("File missing");
        return file;
      },
      async signedUrl(path) {
        return "https://private.test/" + path + "?expires=60";
      },
      async remove(path) {
        files.delete(path);
      },
    };
    const database = process.env["QUEUECARE_OPERATIONS_TEST_SCHEMA"]
      ? await createPostgresDatabase(
          process.env["DATABASE_URL"]!,
          true,
          process.env["QUEUECARE_OPERATIONS_TEST_SCHEMA"],
          () => {},
        )
      : undefined;
    const app = createLocalApp({ ...(database ? { database } : {}), storage, log: () => {} });
    app.http.listen(0, "127.0.0.1");
    await once(app.http, "listening");
    const address = app.http.address();
    assert.ok(address && typeof address !== "string");
    const base = "http://127.0.0.1:" + address.port + "/api";
    async function req(
      path: string,
      cookie = "",
      body?: unknown,
      method = body === undefined ? "GET" : "POST",
    ) {
      const r = await fetch(base + path, {
        method,
        headers: { Cookie: cookie, "Content-Type": "application/json", "X-QueueCare-Request": "1" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const j = await r.json();
      return {
        status: r.status,
        data: j.data,
        cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "",
      };
    }
    try {
      const admin = await req("/auth/login", "", {
        email: process.env["QUEUECARE_ADMIN_EMAIL"] ?? "admin@queuecare.local",
        password: process.env["QUEUECARE_ADMIN_PASSWORD"] ?? "QueueCareAdmin123!",
      });
      assert.equal(admin.status, 200);
      const staffBody = {
        fullName: "Reception Sara",
        email: "sara@phase3.test",
        phone: "123456789",
        role: "receptionist",
        clinicIds: ["northstar"],
        password: "StaffPassword123!",
        active: true,
      };
      const staff = await req("/admin/staff", admin.cookie, staffBody);
      assert.equal(staff.status, 201);
      assert.equal(staff.data.role, "receptionist");
      assert.ok(!JSON.stringify(staff.data).includes("password"));
      assert.deepEqual(
        staff.data.clinics.map((c: { id: string }) => c.id),
        ["northstar"],
      );
      const nurse = await req("/admin/staff", admin.cookie, {
        ...staffBody,
        email: "nurse@phase3.test",
        fullName: "Nurse Ali",
        role: "nurse",
      });
      assert.equal(nurse.status, 201);
      assert.equal(
        (
          await req("/admin/staff", admin.cookie, {
            ...staffBody,
            role: "admin",
            email: "owner@phase3.test",
          })
        ).status,
        400,
      );
      let reception = await req("/auth/login", "", {
          email: staffBody.email,
          password: staffBody.password,
        }),
        nurseLogin = await req("/auth/login", "", {
          email: "nurse@phase3.test",
          password: staffBody.password,
        });
      assert.equal(reception.data.role, "receptionist");
      assert.equal(nurseLogin.data.role, "nurse");
      assert.equal((await req("/auth/me", reception.cookie)).data.role, "receptionist");
      const patient = await req("/auth/register", "", {
          fullName: "Phase Three Patient",
          email: "patient@phase3.test",
          phone: "123456789",
          password: "PatientPassword123!",
        }),
        other = await req("/auth/register", "", {
          fullName: "Other Patient",
          email: "other@phase3.test",
          phone: "123456789",
          password: "PatientPassword123!",
        });
      assert.equal(patient.status, 201);
      const uid = patient.data.id;
      const secondClinic = await req("/admin/clinics", admin.cookie, {
        name: "Phase Three Second Clinic",
        publicName: "Second Clinic",
        address: "Other address",
        phone: "123456789",
        department: "General",
        doctor: "Main Doctor",
        opening: "09:00",
        closing: "17:00",
        avgMin: 10,
        prefix: "B",
        showNext: true,
        consultationFee: 1500,
        active: true,
      });
      assert.equal(secondClinic.status, 201);
      const secondId = secondClinic.data.id;
      assert.equal((await req("/staff/state?clinicId=" + secondId, reception.cookie)).status, 403);
      assert.equal((await req("/clinic?clinicId=" + secondId, nurseLogin.cookie)).status, 403);

      assert.equal((await req("/admin/state", reception.cookie)).status, 403);
      assert.equal((await req("/admin/activity", reception.cookie)).status, 403);
      assert.equal((await req("/patient/state", reception.cookie)).status, 403);
      assert.equal((await req("/staff/state?clinicId=all", reception.cookie)).status, 403);
      assert.equal((await req("/staff/state?clinicId=unassigned", reception.cookie)).status, 403);
      assert.equal(
        (await req("/billing/invoices?clinicId=unassigned", reception.cookie)).status,
        403,
      );
      const assigned = await req(
        "/admin/staff/" + staff.data.id,
        admin.cookie,
        { ...staffBody, clinicIds: ["northstar", secondId] },
        "PUT",
      );
      assert.equal(assigned.status, 200);
      assert.equal((await req("/staff/state", reception.cookie)).status, 401);
      reception = await req("/auth/login", "", {
        email: staffBody.email,
        password: staffBody.password,
      });
      assert.equal((await req("/staff/clinics", reception.cookie)).data.length, 2);
      assert.equal((await req("/staff/state?clinicId=" + secondId, reception.cookie)).status, 200);
      const directory = (await req("/admin/patient-options", admin.cookie)).data;
      assert.ok(
        !directory.some((p: { id: string }) => [staff.data.id, nurse.data.id].includes(p.id)),
      );
      await req("/staff/queue/open?clinicId=northstar", reception.cookie, {});
      const looked = await req(
        "/staff/patient-lookup?clinicId=northstar&email=patient%40phase3.test",
        reception.cookie,
      );
      assert.equal(looked.data.id, uid);
      assert.deepEqual(Object.keys(looked.data).sort(), ["id", "name"]);
      const token = await req("/staff/check-in?clinicId=northstar", reception.cookie, {
        patientId: uid,
        reason: "Review",
      });
      assert.equal(token.status, 200);
      await req("/staff/queue/callNext?clinicId=northstar", reception.cookie, {});
      const prep = await req("/staff/prepare?clinicId=northstar", nurseLogin.cookie, {
        patientId: uid,
        tokenId: token.data.id,
      });
      assert.equal(prep.status, 200);
      assert.equal((await req("/admin/visits/" + prep.data.id, reception.cookie)).status, 403);
      assert.equal((await req("/admin/visits/" + prep.data.id, nurseLogin.cookie)).status, 403);
      assert.equal(
        (await req("/staff/preparations/" + prep.data.id, reception.cookie)).status,
        403,
      );
      const vitals = {
        systolic: 120,
        diastolic: 80,
        pulse: 72,
        temperature: 36.7,
        respiratoryRate: null,
        oxygenSaturation: 98,
        weight: 70,
        height: null,
      };
      assert.equal(
        (
          await req(
            "/staff/preparations/" + prep.data.id,
            nurseLogin.cookie,
            { reasonForVisit: "Review", chiefComplaint: "Patient complaint", vitals },
            "PUT",
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await req(
            "/staff/preparations/" + prep.data.id,
            nurseLogin.cookie,
            {
              reasonForVisit: "Review",
              chiefComplaint: "Complaint",
              vitals,
              diagnosis: "Forbidden",
            },
            "PUT",
          )
        ).status,
        400,
      );
      const clinical = (await req("/admin/visits/" + prep.data.id, admin.cookie)).data;
      assert.equal(clinical.vitals.pulse, 72);
      const sanitized = (await req("/staff/preparations/" + prep.data.id, nurseLogin.cookie)).data;
      assert.equal(sanitized["private_notes"], undefined);
      assert.equal(sanitized.diagnosis, undefined);
      assert.equal(sanitized.prescription, undefined);
      const demographics = {
        fullName: "Phase Three Updated",
        phone: "123456789",
        dateOfBirth: "1995-03-10",
        gender: "female",
        address: "Contact address",
        emergencyContactName: "Family",
        emergencyContactPhone: "123456789",
        bloodGroup: "O+",
      };
      assert.equal(
        (await req("/staff/patients/" + uid, reception.cookie, demographics, "PUT")).status,
        200,
      );
      await req(
        "/admin/patients/" + uid + "/clinical-profile",
        admin.cookie,
        {
          allergies: "Doctor entered",
          chronicConditions: "PRIVATE CONDITION",
          currentMedications: "PRIVATE MEDICATION",
          generalNotes: "PRIVATE DOCTOR NOTE",
        },
        "PUT",
      );
      const basic = await req("/staff/patients/" + uid, reception.cookie);
      assert.ok(
        !JSON.stringify(basic.data).match(
          /PRIVATE|allergies|chronicConditions|currentMedications|generalNotes/,
        ),
      );
      await testDoctorHours(app.db, "northstar");
      const appt = await req("/staff/appointments", reception.cookie, {
        patientId: uid,
        scheduledAt: "2026-12-10T10:00",
        reason: "Follow-up",
      });
      assert.equal(appt.status, 201);
      assert.equal((await req("/patient/appointments", patient.cookie)).data.length, 1);
      assert.equal(
        (
          await req(
            "/operations/appointments/" + appt.data.id,
            reception.cookie,
            { scheduledAt: "2026-12-11T10:00", status: "scheduled" },
            "PUT",
          )
        ).status,
        200,
      );
      const input = {
        patientId: uid,
        clinicId: "northstar",
        visitId: prep.data.id,
        documentType: "lab_report",
        title: "Private lab report",
        description: "Doctor uploaded report",
        filename: "report.pdf",
        mimeType: "application/pdf",
        fileSize: 16,
      };
      assert.equal((await req("/documents/upload", reception.cookie, input)).status, 403);
      assert.equal((await req("/documents/upload", patient.cookie, input)).status, 403);
      assert.equal(
        (await req("/documents/upload", nurseLogin.cookie, { ...input, clinicId: "unassigned" }))
          .status,
        403,
      );
      const init = await req("/documents/upload", nurseLogin.cookie, input);
      assert.equal(init.status, 201);
      const filePath = init.data.url.slice("memory://".length);
      files.set(filePath, Buffer.from("%PDF-1.4\nreport"));
      // Declared file length must match the actual object, not its extension.
      const goodPdf = Buffer.from("%PDF-1.4\nreport");
      input.fileSize = goodPdf.length;
      assert.equal(
        (await req("/documents/" + init.data.id + "/complete", nurseLogin.cookie, {})).status,
        400,
      );
      assert.ok(!files.has(filePath));
      const good = await req("/documents/upload", nurseLogin.cookie, input);
      const path = good.data.url.slice("memory://".length);
      files.set(path, goodPdf);
      assert.equal(
        (await req("/documents/" + good.data.id + "/complete", nurseLogin.cookie, {})).status,
        200,
      );
      assert.equal((await req("/documents", patient.cookie)).data.length, 0);
      assert.equal(
        (await req("/documents/" + good.data.id + "/download", patient.cookie)).status,
        404,
      );
      assert.equal(
        (await req("/documents/" + good.data.id + "/download", reception.cookie)).status,
        403,
      );
      assert.equal(
        (
          await req(
            "/documents/" + good.data.id + "/release",
            nurseLogin.cookie,
            { patientVisible: true },
            "PUT",
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await req(
            "/documents/" + good.data.id + "/release",
            admin.cookie,
            { patientVisible: true },
            "PUT",
          )
        ).status,
        200,
      );
      assert.equal(
        (await req("/documents?visitId=" + prep.data.id, patient.cookie)).data.length,
        1,
      );
      assert.equal(
        (await req("/documents/" + good.data.id + "/download", patient.cookie)).data.expiresIn,
        60,
      );
      assert.equal(
        (await req("/documents/" + good.data.id + "/download", other.cookie)).status,
        404,
      );
      const invoiceBody = {
        patientId: uid,
        clinicId: "northstar",
        visitId: prep.data.id,
        appointmentId: appt.data.id,
        discount: 50,
        dueAt: "2026-12-10",
        draft: false,
        items: [
          { description: "Consultation", quantity: 1, unitPrice: 10000 },
          { description: "Service", quantity: 2, unitPrice: 125 },
        ],
      };
      assert.equal((await req("/billing/invoices", nurseLogin.cookie, invoiceBody)).status, 403);
      assert.equal((await req("/billing/invoices", patient.cookie, invoiceBody)).status, 403);
      const invoice = await req("/billing/invoices", reception.cookie, invoiceBody);
      assert.equal(invoice.status, 201);
      assert.equal(invoice.data.total, 10200);
      assert.equal(invoice.data.items.length, 2);
      assert.equal(invoice.data.status, "unpaid");
      const invoiceId = invoice.data.id;
      assert.equal((await req("/billing/invoices/" + invoiceId, other.cookie)).status, 404);
      assert.equal(
        (
          await req("/billing/invoices/" + invoiceId + "/payments", patient.cookie, {
            amount: 1,
            method: "cash",
            reference: "",
            paidAt: new Date().toISOString(),
            requestId: randomUUID(),
          })
        ).status,
        403,
      );
      const payment = {
        amount: 5000,
        method: "cash",
        reference: "Receipt entry",
        paidAt: new Date().toISOString(),
        requestId: randomUUID(),
      };
      const partial = await req(
        "/billing/invoices/" + invoiceId + "/payments",
        reception.cookie,
        payment,
      );
      assert.equal(partial.status, 201);
      assert.equal(partial.data.status, "partially_paid");
      assert.equal(partial.data.balance, 5200);
      const repeat = await req(
        "/billing/invoices/" + invoiceId + "/payments",
        reception.cookie,
        payment,
      );
      assert.equal(repeat.data.payments.length, 1);
      assert.equal(
        (
          await req("/billing/invoices/" + invoiceId + "/payments", reception.cookie, {
            ...payment,
            amount: 5201,
            requestId: randomUUID(),
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await req("/billing/invoices/" + invoiceId + "/payments", reception.cookie, {
            ...payment,
            amount: -1,
            requestId: randomUUID(),
          })
        ).status,
        400,
      );
      const final = await req("/billing/invoices/" + invoiceId + "/payments", reception.cookie, {
        ...payment,
        amount: 5200,
        method: "bank_transfer",
        requestId: randomUUID(),
      });
      assert.equal(final.data.status, "paid");
      assert.equal(final.data.balance, 0);
      assert.equal(final.data.amount_paid, 10200);
      assert.equal(final.data.payments.length, 2);
      assert.equal(
        (await req("/billing/invoices/" + invoiceId, patient.cookie)).data.payments.length,
        2,
      );
      assert.equal(
        (await req("/billing/invoices/" + invoiceId + "/void", reception.cookie, {})).status,
        409,
      );
      const draft = await req("/billing/invoices", admin.cookie, { ...invoiceBody, draft: true });
      assert.equal(draft.data.status, "draft");
      assert.equal((await req("/billing/invoices/" + draft.data.id, patient.cookie)).status, 404);
      const issued = await req(
        "/billing/invoices/" + draft.data.id,
        reception.cookie,
        { ...invoiceBody, draft: false },
        "PUT",
      );
      assert.equal(issued.data.status, "unpaid");
      const voided = await req(
        "/billing/invoices/" + draft.data.id + "/void",
        reception.cookie,
        {},
      );
      assert.equal(voided.data.status, "void");
      const notifications = (await req("/notifications", patient.cookie)).data;
      assert.ok(notifications.some((n: { type: string }) => n.type === "document.released"));
      assert.ok(notifications.some((n: { type: string }) => n.type === "invoice.issued"));
      assert.ok(
        notifications.filter((n: { type: string }) => n.type.startsWith("payment.recorded"))
          .length === 2,
      );
      assert.ok(!JSON.stringify(notifications).includes("PRIVATE"));
      assert.equal((await req("/notifications", other.cookie)).data.length, 0);
      assert.equal(
        (await req("/notifications/" + notifications[0].id + "/read", other.cookie, {})).status,
        404,
      );
      assert.equal(
        (await req("/notifications/" + notifications[0].id + "/read", patient.cookie, {})).status,
        200,
      );
      assert.ok(
        (await req("/notifications", patient.cookie)).data.find(
          (n: { id: string }) => n.id === notifications[0].id,
        ).read_at,
      );
      await req("/notifications/read-all", patient.cookie, {});
      assert.ok(
        (await req("/notifications", patient.cookie)).data.every(
          (n: { read_at: string }) => n.read_at,
        ),
      );
      const audit = (await req("/admin/activity", admin.cookie)).data;
      for (const event of [
        "staff.created",
        "vitals.updated",
        "document.uploaded",
        "document.released",
        "payment.recorded",
        "patient.demographics.updated",
      ])
        assert.ok(
          audit.some((a: { action: string }) => a.action === event),
          event,
        );
      assert.ok(
        !JSON.stringify(audit).match(/PRIVATE|StaffPassword|PatientPassword|password_hash/),
      );
      assert.equal((await req("/admin/activity", nurseLogin.cookie)).status, 403);
      assert.equal((await req("/admin/activity", patient.cookie)).status, 403);
      assert.equal(
        (
          await req(
            "/admin/staff/" + staff.data.id,
            admin.cookie,
            { ...staffBody, active: false },
            "PUT",
          )
        ).status,
        200,
      );
      assert.equal((await req("/staff/state", reception.cookie)).status, 401);
      assert.equal(
        (await req("/auth/login", "", { email: staffBody.email, password: staffBody.password }))
          .status,
        401,
      );
      assert.equal(
        (
          await req(
            "/admin/staff/" + staff.data.id,
            admin.cookie,
            { ...staffBody, active: true },
            "PUT",
          )
        ).status,
        200,
      );
      assert.equal(
        (await req("/auth/login", "", { email: staffBody.email, password: staffBody.password }))
          .data.role,
        "receptionist",
      );
    } finally {
      await app.close();
    }
  },
);
