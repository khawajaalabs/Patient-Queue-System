import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createLocalApp } from "../app.ts";
import { createPostgresDatabase } from "../db/postgres.ts";
import { testDoctorHours } from "./availability-fixture.ts";
import { one } from "../db/database.ts";
import type { DocumentStorage } from "../services/document-storage.ts";
test(
  "Clinical additions: notes, owned private uploads, verified bytes, clinic library and immutable structured prescriptions",
  { timeout: 180000 },
  async () => {
    const files = new Map<string, Uint8Array>();
    let failRemove = false;
    const storage: DocumentStorage = {
      async uploadUrl(path) {
        return "memory://" + path;
      },
      async read(path) {
        return files.get(path)!;
      },
      async signedUrl() {
        return "https://private.test/download?expires=60";
      },
      async remove(path) {
        if (failRemove) throw Error("Temporary storage failure");
        files.delete(path);
      },
    };
    const schema = process.env["QUEUECARE_WORKFLOW_TEST_SCHEMA"];
    const database = schema
      ? await createPostgresDatabase(process.env["DATABASE_URL"]!, true, schema, () => {})
      : undefined;
    const app = createLocalApp({ ...(database ? { database } : {}), storage, log: () => {} });
    app.http.listen(0, "127.0.0.1");
    await once(app.http, "listening");
    const address = app.http.address();
    assert.ok(address && typeof address !== "string");
    const port = address.port;
    async function req(
      path: string,
      cookie = "",
      body?: unknown,
      method = body === undefined ? "GET" : "POST",
    ) {
      const r = await fetch("http://127.0.0.1:" + port + "/api" + path, {
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
      const p = await req("/auth/register", "", {
          fullName: "Workflow Patient",
          email: "workflow@clinical.test",
          phone: "123456789",
          password: "PatientPassword123!",
        }),
        other = await req("/auth/register", "", {
          fullName: "Other Patient",
          email: "other@clinical.test",
          phone: "123456789",
          password: "PatientPassword123!",
        });
      await testDoctorHours(app.db, "northstar");
      const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const slots = await req(
        `/appointments/available-slots?clinicId=northstar&date=${date}`,
        p.cookie,
      );
      const at = slots.data.slots[0].value;
      const booking = await req("/patient/appointments", p.cookie, {
        clinicId: "northstar",
        scheduledAt: at,
        reason: "Visit reason",
        patientNotes: "Patient context: allergies and reports",
      });
      assert.equal(booking.status, 201);
      const id = booking.data.id;
      const context = await req(`/appointments/${id}/context`, p.cookie);
      assert.equal(context.data.patientNotes, "Patient context: allergies and reports");
      assert.ok(!JSON.stringify(context.data).includes("privateNotes"));
      assert.equal((await req(`/appointments/${id}/context`, other.cookie)).status, 404);
      const staffBody = {
        fullName: "Reception Staff",
        email: "reception@clinical.test",
        phone: "123456789",
        password: "StaffPassword123!",
        role: "receptionist",
        clinicIds: ["northstar"],
        active: true,
      };
      await req("/admin/staff", admin.cookie, staffBody);
      const reception = await req("/auth/login", "", {
        email: staffBody.email,
        password: staffBody.password,
      });
      await req("/admin/staff", admin.cookie, {
        ...staffBody,
        role: "nurse",
        email: "nurse@clinical.test",
      });
      const nurse = await req("/auth/login", "", {
        email: "nurse@clinical.test",
        password: staffBody.password,
      });
      assert.equal((await req(`/appointments/${id}/context`, reception.cookie)).status, 403);
      const metadata = {
        title: "Lab report",
        type: "lab_report",
        filename: "lab.pdf",
        mime: "application/pdf",
        size: 8,
      };
      assert.equal(
        (await req(`/appointments/${id}/attachments`, p.cookie, { ...metadata, size: 10485761 }))
          .status,
        400,
      );
      assert.equal(
        (await req(`/appointments/${id}/attachments`, other.cookie, metadata)).status,
        404,
      );
      const prepared = await req(`/appointments/${id}/attachments`, p.cookie, metadata);
      assert.equal(prepared.status, 201);
      files.set(prepared.data.uploadUrl.slice(9), Buffer.from("%PDF-1.7"));
      const fid = prepared.data.id;
      assert.equal((await req(`/appointment-attachments/${fid}/download`, p.cookie)).status, 404);
      assert.equal(
        (await req(`/appointment-attachments/${fid}/complete`, p.cookie, {})).status,
        200,
      );
      assert.equal(
        (await req(`/appointment-attachments/${fid}/download`, other.cookie)).status,
        404,
      );
      assert.equal(
        (await req(`/appointment-attachments/${fid}/download`, reception.cookie)).status,
        403,
      );
      assert.equal(
        (await req(`/appointment-attachments/${fid}/download`, nurse.cookie)).status,
        200,
      );
      assert.equal(
        (await req(`/appointment-attachments/${fid}/download`, admin.cookie)).status,
        200,
      );
      assert.equal(
        (await req(`/appointment-attachments/${fid}`, p.cookie, {}, "DELETE")).status,
        409,
      );
      assert.equal((await req(`/appointments/${id}/attachments`,nurse.cookie)).data.length,1);
      assert.equal((await req(`/appointments/${id}/attachments`,reception.cookie)).status,403);
      const bad = await req(`/appointments/${id}/attachments`, p.cookie, {
        ...metadata,
        title: "Invalid file",
      });
      files.set(bad.data.uploadUrl.slice(9), Buffer.from("badbytes"));
      failRemove = true;
      assert.equal(
        (await req(`/appointment-attachments/${bad.data.id}/complete`, p.cookie, {})).status,
        400,
      );
      assert.equal(
        (await one<{ status: string }>(
          app.db,
          "SELECT status FROM appointment_attachments WHERE id=?",
          bad.data.id,
        ))!.status,
        "failed",
      );
      failRemove = false;
      assert.equal((await req(`/appointments/${id}/context`, p.cookie)).data.attachments.length, 2);
      assert.equal((await req("/admin/medicine-library?clinicId=northstar", p.cookie)).status, 403);
      const med = await req("/admin/medicine-library?clinicId=northstar", admin.cookie, {
        name: "Example medicine",
        strength: "250 mg",
        dosageForm: "Tablet",
        defaultFrequency: "Twice daily",
      });
      assert.equal(med.status, 201);
      const encounter = await req(`/admin/patients/${p.data.id}/visits`, admin.cookie, {
        clinicId: "northstar",
        appointmentId: id,
      });
      assert.equal(encounter.status, 200);
      const v = encounter.data;
      const draft = {
        reasonForVisit: v.reasonForVisit,
        chiefComplaint: "",
        historyNotes: "private history",
        examinationNotes: "",
        diagnosis: "diagnosis",
        releaseDiagnosis: true,
        treatmentPlan: "treatment",
        followUpInstructions: "Review",
        followUpDate: null,
        privateNotes: "secret notes",
        patientSummary: "summary",
        vitals: v.vitals,
        prescription: {
          instructions: "General instructions",
          items: [
            {
              medicine: "Example medicine",
              strength: "250 mg",
              dosageForm: "Tablet",
              catalogId: med.data.id,
              dose: "1 tablet",
              frequency: "Twice daily",
              duration: "5 days",
              instructions: "After meal",
            },
            {
              medicine: "Custom medicine",
              dose: "",
              frequency: "",
              duration: "",
              instructions: "",
            },
          ],
        },
      };
      const saved = await req("/admin/visits/" + v.id, admin.cookie, draft, "PUT");
      assert.equal(saved.status, 200);
      assert.equal(saved.data.prescription.items[0].strength, "250 mg");
      assert.equal(
        (await req("/admin/medicine-library?clinicId=northstar", admin.cookie)).data.length,
        1,
      );
      const completed = await req("/admin/visits/" + v.id + "/complete", admin.cookie, draft);
      assert.equal(completed.status, 200);
      assert.equal(
        (
          await req(
            "/admin/visits/" + v.id,
            admin.cookie,
            { ...draft, patientSummary: "changed" },
            "PUT",
          )
        ).status,
        409,
      );
      const own = await req("/patient/visits/" + v.id, p.cookie);
      assert.equal(own.status, 200);
      assert.equal(own.data.prescription.items.length, 2);
      assert.ok(!JSON.stringify(own.data).includes("secret notes"));
      assert.ok(!JSON.stringify(own.data).includes("private history"));
      assert.equal((await req("/patient/visits/" + v.id, other.cookie)).status, 404);
      assert.equal(
        (await req(`/appointments/${id}/context`, p.cookie)).data.attachments[0].status,
        "ready",
      );
      assert.equal((await req(`/appointments/${id}/attachments`, p.cookie, metadata)).status, 409);
      const before = JSON.stringify(own.data.prescription);
      await req(
        "/admin/medicine-library/" + med.data.id,
        admin.cookie,
        { name: "Changed catalog name", strength: "500 mg", active: false },
        "PUT",
      );
      assert.equal(
        JSON.stringify((await req("/patient/visits/" + v.id, p.cookie)).data.prescription),
        before,
      );
      assert.equal(
        (await req("/admin/visits/" + v.id, reception.cookie, draft, "PUT")).status,
        403,
      );
      await app.db
        .prepare("UPDATE appointment_attachments SET expires_at=? WHERE id=?")
        .run(Date.now() - 1, bad.data.id);
      assert.equal(
        (await req("/admin/appointment-attachments/cleanup", admin.cookie, {})).data.removed,
        1,
      );
    } finally {
      await app.close();
    }
  },
);
