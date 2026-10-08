import { many, one, type Database } from "../db/database.ts";
export interface ApplicationEmailProvider {
  send(to: string, subject: string, text: string): Promise<void>;
}
export function configuredEmailProvider(): ApplicationEmailProvider | null {
  if (
    process.env["EMAIL_PROVIDER"] !== "resend" ||
    !process.env["EMAIL_API_KEY"] ||
    !process.env["EMAIL_FROM"]
  )
    return null;
  return {
    async send(to, subject, text) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: "Bearer " + process.env["EMAIL_API_KEY"],
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: process.env["EMAIL_FROM"], to: [to], subject, text }),
      });
      if (!r.ok) throw new Error("Email provider did not accept the message.");
    },
  };
}
export async function deliverEmails(
  db: Database,
  provider: ApplicationEmailProvider | null = configuredEmailProvider(),
) {
  if (!provider) return { configured: false, sent: 0, failed: 0 };
  const rows = await many<{ id: string; email: string; title: string }>(
    db,
    "SELECT l.id,u.email,n.title FROM email_delivery_log l JOIN users u ON u.id=l.user_id JOIN notifications n ON n.id=l.notification_id WHERE l.status='pending' AND l.attempts<3 ORDER BY l.created_at LIMIT 20",
  );
  let sent = 0,
    failed = 0;
  for (const row of rows) {
    const claimed = (await db
      .prepare(
        "UPDATE email_delivery_log SET status='failed',attempts=attempts+1 WHERE id=? AND status='pending'",
      )
      .run(row.id)) as { changes: number };
    if (!claimed.changes) continue;
    try {
      await provider.send(
        row.email,
        "QueueCare account update",
        "An update is available in your QueueCare account. Sign in at " +
          new URL(process.env["APP_URL"] ?? "http://localhost:5174").origin +
          " to view it.",
      );
      await db
        .prepare("UPDATE email_delivery_log SET status='sent',sent_at=? WHERE id=?")
        .run(new Date().toISOString(), row.id);
      sent++;
    } catch {
      failed++;
    }
  }
  return { configured: true, sent, failed };
}
