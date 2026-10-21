import PDFDocument from "pdfkit";
import { Router } from "express";
import { one, type Database } from "../db/database.ts";
import { requireRole, ApiError } from "../middleware/auth.ts";
import { tokenValue } from "../services/queueService.ts";
export function tokenDocumentRoutes(db: Database) {
  const r = Router();
  const data = async (id: string, user: { id: string; role: string }) => {
    const t = await one<any>(
      db,
      "SELECT t.*,q.queue_date,q.clinic_id,c.name clinic_name,c.city,c.area,c.address,c.phone clinic_phone,a.scheduled_at,u.full_name,u.phone FROM tokens t JOIN appointments a ON a.id=t.appointment_id JOIN daily_queues q ON q.id=t.queue_id JOIN clinics c ON c.id=q.clinic_id JOIN users u ON u.id=t.patient_id WHERE t.id=?",
      id,
    );
    if (!t || (user.role !== "admin" && (user.role !== "patient" || user.id !== t.patient_id)))
      throw new ApiError(404, "NOT_FOUND", "Token not found.");
    return t;
  };
  r.get("/patient/tokens/:id", requireRole(db), async (req, res) => {
    const t = await data(String(req.params["id"]), res.locals["user"]);
    res.json({
      success: true,
      data: {
        ...tokenValue(t),
        city: t.city,
        area: t.area,
        address: t.address,
        clinicPhone: t.clinic_phone,
      },
    });
  });
  r.get("/patient/tokens/:id/pdf", requireRole(db), async (req, res) => {
    const t = await data(String(req.params["id"]), res.locals["user"]);
    const pdf = new PDFDocument({
      size: "A4",
      margin: 50,
      info: { Title: "Neuro Spine Care Center appointment token" },
    });
    const chunks: Buffer[] = [];
    pdf.on("data", (c) => chunks.push(c));
    const finished = new Promise<Buffer>((resolve) =>
      pdf.on("end", () => resolve(Buffer.concat(chunks))),
    );
    pdf.fillColor("#148577").fontSize(22).text("Neuro Spine Care Center");
    pdf.moveDown().fillColor("#152b29").fontSize(18).text(t.clinic_name);
    pdf
      .fontSize(11)
      .text([t.area, t.city].filter(Boolean).join(" · "))
      .text(t.address)
      .text(t.clinic_phone);
    pdf.moveDown(2).fontSize(12).text("APPOINTMENT TOKEN");
    pdf.fontSize(48).fillColor("#148577").text(t.token_code);
    pdf
      .moveDown()
      .fillColor("#152b29")
      .fontSize(13)
      .text("Patient: " + t.full_name)
      .text("Appointment date: " + t.queue_date)
      .text("Appointment time: " + t.scheduled_at.slice(11) + " (Asia/Karachi)")
      .text("Status: " + tokenValue(t).status);
    pdf
      .moveDown(2)
      .fontSize(11)
      .text("Arrive a little before your appointment. Show this token at reception.")
      .text("Token numbers identify appointments; patients are called in appointment-time order.");
    pdf
      .moveDown()
      .fontSize(9)
      .fillColor("#647471")
      .text("Generated: " + new Date().toISOString());
    pdf.end();
    res
      .type("application/pdf")
      .setHeader(
        "Content-Disposition",
        `attachment; filename="Neuro-Spine-Care-Center-${t.token_code}-${t.queue_date}.pdf"`,
      );
    res.send(await finished);
  });
  return r;
}
