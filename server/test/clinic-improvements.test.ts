import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createLocalApp } from "../app.ts";
import { createPostgresDatabase } from "../db/postgres.ts";
import { one } from "../db/database.ts";
import { testDoctorHours } from "./availability-fixture.ts";
import { patientToday, ageOnDate, validBirthDate } from "../../src/domain/patient-demographics.ts";
import type { DocumentStorage } from "../services/document-storage.ts";

test(
  "Clinic improvements preserve clinical data, identities and private file ownership",
  { timeout: 900000 },
  async (t) => {
    const files = new Map<string, Uint8Array>();
    const storage: DocumentStorage = {
      async uploadUrl(path) {
        return "memory://" + path;
      },
      async read(path) {
        if (!files.has(path)) throw Error("Missing file");
        return files.get(path)!;
      },
      async signedUrl() {
        return "https://private.test/signed?expires=60";
      },
      async remove(path) {
        files.delete(path);
      },
    };
    const schema = process.env["QUEUECARE_NEURO_TEST_SCHEMA"];
    const database = schema
      ? await createPostgresDatabase(process.env["DATABASE_URL"]!, true, schema, () => {})
      : undefined;
    const app = createLocalApp({ ...(database ? { database } : {}), storage, log: () => {} });
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
        headers: { Cookie: cookie, "Content-Type": "application/json", "X-QueueCare-Request": "1" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: r.status,
        json: await r.json(),
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
        fullName: "Neuro Patient",
        email: "neuro@fixture.test",
        phone: "03001234567",
        password: "PatientPassword123!",
      });
      const other = await req("/auth/register", "", {
        fullName: "Other Patient",
        email: "other-neuro@fixture.test",
        phone: "03001234567",
        password: "PatientPassword123!",
      });
      assert.equal(p.status, 201);
      assert.equal(other.status, 201);
      const uid = p.json.data.id;
      await t.test(
        "DOB boundaries, valid leap dates, derived age and historical demographics",
        async () => {
          assert.equal(patientToday(new Date("2026-12-31T20:00:00Z")), "2027-01-01");
          assert.equal(validBirthDate("2000-02-29"), true);
          assert.equal(validBirthDate("2001-02-29"), false);
          assert.equal(ageOnDate("2005-06-15", "2026-06-14"), 20);
          assert.equal(ageOnDate("2005-06-15", "2026-06-15"), 21);
          assert.equal(ageOnDate("2000-02-29", "2025-02-28"), 24);
          assert.equal(ageOnDate("2000-02-29", "2025-03-01"), 25);
          const input = {
            fullName: "Neuro Patient",
            phone: "03001234567",
            address: "Lahore",
            gender: "prefer_not_to_say",
            dateOfBirth: "2000-02-29",
          };
          assert.equal(
            (
              await req(
                "/patient/profile",
                p.cookie,
                {
                  ...input,
                  emergencyContactName: "Historical relative",
                  emergencyContactPhone: "03005556666",
                  bloodGroup: "A+",
                },
                "PUT",
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await req(
                "/patient/profile",
                p.cookie,
                { ...input, dateOfBirth: "2999-01-01" },
                "PUT",
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await req(
                "/patient/profile",
                p.cookie,
                { ...input, dateOfBirth: "2001-02-29" },
                "PUT",
              )
            ).status,
            400,
          );
          const saved = await req("/patient/profile", p.cookie, input, "PUT");
          assert.equal(saved.status, 200);
          assert.equal(saved.json.data.bloodGroup, "A+");
          assert.equal(saved.json.data.emergencyContactName, "Historical relative");
          assert.equal(saved.json.data.dateOfBirth, "2000-02-29");
          assert.equal(saved.json.data.gender, "prefer_not_to_say");
        },
      );
      await testDoctorHours(app.db, "northstar");
      const tomorrow = new Date(patientToday() + "T12:00:00Z");
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const date = tomorrow.toISOString().slice(0, 10);
      const slots = (
        await req("/appointments/available-slots?clinicId=northstar&date=" + date, p.cookie)
      ).json.data.slots;
      const booking = await req("/patient/appointments", p.cookie, {
        clinicId: "northstar",
        scheduledAt: slots[0].value,
        reason: "Review",
      });
      assert.equal(booking.status, 201);
      const appointment = booking.json.data.id;
      let attachment = "";
      await t.test(
        "Private booking uploads validate extension, declared size, actual bytes, ownership and safe retry",
        async () => {
          const metadata = {
            title: "Supporting report",
            type: "lab_report",
            filename: "report.pdf",
            mime: "application/pdf",
            size: 8,
            uploadKey: randomUUID(),
          };
          assert.equal(
            (await req(`/appointments/${appointment}/attachments`, "", metadata)).status,
            401,
          );
          assert.equal(
            (await req(`/appointments/${appointment}/attachments`, other.cookie, metadata)).status,
            404,
          );
          assert.equal(
            (
              await req(`/appointments/${appointment}/attachments`, p.cookie, {
                ...metadata,
                filename: "report.exe",
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await req(`/appointments/${appointment}/attachments`, p.cookie, {
                ...metadata,
                filename: "../report.pdf",
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await req(`/appointments/${appointment}/attachments`, p.cookie, {
                ...metadata,
                size: 10485761,
              })
            ).status,
            400,
          );
          const bad = await req(`/appointments/${appointment}/attachments`, p.cookie, {
            ...metadata,
            uploadKey: randomUUID(),
          });
          const badPath = bad.json.data.uploadUrl.replace("memory://", "");
          files.set(badPath, Buffer.from("not pdf!"));
          assert.equal(
            (await req(`/appointment-attachments/${bad.json.data.id}/complete`, p.cookie, {}))
              .status,
            400,
          );
          assert.equal(files.has(badPath), false);
          const prepared = await req(
            `/appointments/${appointment}/attachments`,
            p.cookie,
            metadata,
          );
          assert.equal(prepared.status, 201);
          attachment = prepared.json.data.id;
          const path = prepared.json.data.uploadUrl.replace("memory://", "");
          files.set(path, Buffer.from("%PDF-1.7"));
          assert.equal(
            (await req(`/appointment-attachments/${attachment}/complete`, p.cookie, {})).status,
            200,
          );
          assert.equal(
            (await req(`/appointment-attachments/${attachment}/complete`, p.cookie, {})).status,
            200,
          );
          const retry = await req(`/appointments/${appointment}/attachments`, p.cookie, metadata);
          assert.equal(retry.json.data.ready, true);
          assert.equal(retry.json.data.id, attachment);
          assert.equal(
            (await req(`/appointment-attachments/${attachment}/download`, other.cookie)).status,
            404,
          );
          assert.equal(
            (await req(`/appointment-attachments/${attachment}/download`, p.cookie)).status,
            200,
          );
          assert.equal(
            (
              await req(
                "/operations/appointments/" + appointment,
                admin.cookie,
                { status: "scheduled", scheduledAt: slots[1].value },
                "PUT",
              )
            ).status,
            200,
          );
          const context = (await req("/appointments/" + appointment + "/context", p.cookie)).json
            .data;
          assert.ok(context.attachments.some((f: { id: string }) => f.id === attachment));
          assert.equal(context.token.id, booking.json.data.token.id);
        },
      );
      await t.test(
        "Failed upload retries respect the ten-file limit while ready retries remain idempotent",
        async () => {
          const metadata = {
            title: "Limit check",
            type: "lab_report",
            filename: "report.pdf",
            mime: "application/pdf",
            size: 8,
          };
          for (let i = 0; i < 9; i++)
            assert.equal(
              (
                await req("/appointments/" + appointment + "/attachments", p.cookie, {
                  ...metadata,
                  uploadKey: randomUUID(),
                })
              ).status,
              201,
            );
          const failed = await one<{ id: string }>(
            app.db,
            "SELECT id FROM appointment_attachments WHERE appointment_id=? AND status='failed' LIMIT 1",
            appointment,
          );
          assert.ok(failed);
          assert.equal(
            (
              await req("/appointments/" + appointment + "/attachments", p.cookie, {
                ...metadata,
                uploadKey: failed.id,
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await req("/appointments/" + appointment + "/attachments", p.cookie, {
                ...metadata,
                uploadKey: attachment,
              })
            ).json.data.ready,
            true,
          );
        },
      );
      const visit = (
        await req("/admin/patients/" + uid + "/visits", admin.cookie, {
          clinicId: "northstar",
          appointmentId: appointment,
        })
      ).json.data;
      await t.test(
        "Consultation uploads are distinct, private, content-verified and idempotent",
        async () => {
          const input = {
            patientId: uid,
            clinicId: "northstar",
            visitId: visit.id,
            documentType: "imaging_report",
            title: "Consultation image",
            description: "Synthetic fixture",
            filename: "image.png",
            mimeType: "image/png",
            fileSize: 8,
            uploadKey: randomUUID(),
          };
          assert.equal((await req("/documents/upload", p.cookie, input)).status, 403);
          assert.equal(
            (await req("/documents/upload", admin.cookie, { ...input, visitId: "missing" })).status,
            400,
          );
          const [a, b] = await Promise.all([
            req("/documents/upload", admin.cookie, input),
            req("/documents/upload", admin.cookie, input),
          ]);
          assert.equal(a.status, 201);
          assert.equal(b.status, 201);
          assert.equal(a.json.data.id, b.json.data.id);
          const path = a.json.data.url.replace("memory://", "");
          files.set(path, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
          assert.equal(
            (await req("/documents/" + a.json.data.id + "/complete", admin.cookie, {})).status,
            200,
          );
          assert.equal((await req("/documents/upload", admin.cookie, input)).json.data.ready, true);
          assert.equal(
            (await req("/documents/" + a.json.data.id + "/download", p.cookie)).status,
            404,
          );
          assert.equal(
            (await req("/documents/" + a.json.data.id + "/download", other.cookie)).status,
            404,
          );
          assert.equal(
            (await req("/documents/" + a.json.data.id + "/download", admin.cookie)).status,
            200,
          );
          const rows = (
            await req("/documents?clinicId=northstar&visitId=" + visit.id, admin.cookie)
          ).json.data;
          assert.equal(rows.length, 1);
          assert.equal(rows[0].visit_id, visit.id);
        },
      );
      await t.test(
        "Unused medicines delete; referenced medicines archive without changing prescriptions",
        async () => {
          const unused = (
            await req("/admin/medicine-library?clinicId=northstar", admin.cookie, {
              name: "Unused medicine",
            })
          ).json.data;
          assert.equal(
            (await req("/admin/medicine-library/" + unused.id, p.cookie, undefined, "DELETE"))
              .status,
            403,
          );
          const deleted = await req(
            "/admin/medicine-library/" + unused.id,
            admin.cookie,
            undefined,
            "DELETE",
          );
          assert.equal(deleted.status, 200);
          assert.equal(deleted.json.data.archived, false);
          assert.equal(
            await one(app.db, "SELECT id FROM medicine_catalog WHERE id=?", unused.id),
            undefined,
          );
          const used = (
            await req("/admin/medicine-library?clinicId=northstar", admin.cookie, {
              name: "Historical medicine",
            })
          ).json.data;
          const body = {
            reasonForVisit: "Review",
            chiefComplaint: "",
            historyNotes: "",
            examinationNotes: "",
            diagnosis: "",
            releaseDiagnosis: false,
            treatmentPlan: "",
            followUpInstructions: "",
            followUpDate: null,
            privateNotes: "",
            patientSummary: "Synthetic visit",
            vitals: visit.vitals,
            prescription: {
              instructions: "",
              items: [
                {
                  medicine: "Historical medicine",
                  catalogId: used.id,
                  dose: "1",
                  frequency: "Daily",
                  duration: "2 days",
                  instructions: "",
                },
              ],
            },
          };
          const completed = await req(
            "/admin/visits/" + visit.id + "/complete",
            admin.cookie,
            body,
          );
          assert.equal(completed.status, 200);
          const before = JSON.stringify(
            (await req("/patient/visits/" + visit.id, p.cookie)).json.data.prescription,
          );
          const archived = await req(
            "/admin/medicine-library/" + used.id,
            admin.cookie,
            undefined,
            "DELETE",
          );
          assert.equal(archived.status, 200);
          assert.equal(archived.json.data.archived, true);
          assert.equal(
            (await req("/admin/medicine-library?clinicId=northstar", admin.cookie)).json.data.find(
              (m: { id: string }) => m.id === used.id,
            ).active,
            false,
          );
          assert.equal(
            JSON.stringify(
              (await req("/patient/visits/" + visit.id, p.cookie)).json.data.prescription,
            ),
            before,
          );
        },
      );
      await t.test(
        "Existing sessions, token PDFs and internal routes survive public branding changes",
        async () => {
          for (let i = 0; i < 3; i++)
            assert.equal((await req("/auth/me", p.cookie)).json.data.id, uid);
          const r = await fetch(
            `http://127.0.0.1:${addr.port}/api/patient/tokens/${booking.json.data.token.id}/pdf`,
            { headers: { Cookie: p.cookie } },
          );
          assert.equal(r.status, 200);
          assert.match(r.headers.get("content-disposition") ?? "", /Neuro-Spine-Care-Center-/);
          assert.equal((await r.arrayBuffer()).byteLength > 500, true);
          assert.equal(
            (
              await req("/appointments/" + appointment + "/context", p.cookie)
            ).json.data.attachments.some((f: { id: string }) => f.id === attachment),
            true,
          );
        },
      );
    } finally {
      await app.close();
    }
  },
);
