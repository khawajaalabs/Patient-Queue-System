/** QueueCare uses the Karachi calendar throughout browser and backend operations. */
export function clinicDayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"].map((key) => parts.find((p) => p.type === key)?.value).join("-");
}
export function patientPosition(tokens, tokenCode, averageMinutes) {
  const waiting = tokens
    .filter((t) => t.status === "waiting")
    .sort((a, b) => a.queueOrder - b.queueOrder);
  const ahead = Math.max(
    0,
    waiting.findIndex((t) => t.tokenCode === tokenCode),
  );
  return { ahead, eta: ahead * averageMinutes };
}
/** Explicit public allowlist: no contact information, identity or visit details. */
export function publicProjection(clinic, queue, tokens = []) {
  const waiting =
    queue?.waitingTokens ??
    tokens
      .filter((t) => t.status === "waiting")
      .sort((a, b) => a.queueOrder - b.queueOrder)
      .map((t) => ({ tokenCode: t.tokenCode, queueOrder: t.queueOrder }));
  return {
    name: clinic.name ?? "",
    displayName: clinic.publicDisplayName || clinic.name || "",
    department: clinic.department ?? "",
    tokenPrefix: clinic.tokenPrefix ?? "A",
    averageConsultationMinutes: clinic.averageConsultationMinutes ?? 5,
    publicDisplayShowNext: clinic.publicDisplayShowNext !== false,
    queueDate: queue?.queueDate ?? clinicDayKey(),
    status: queue?.status ?? "unavailable",
    currentToken:
      queue?.currentTokenCode ?? tokens.find((t) => t.status === "serving")?.tokenCode ?? null,
    nextTokens:
      clinic.publicDisplayShowNext === false ? [] : waiting.slice(0, 3).map((t) => t.tokenCode),
    waitingTokens: waiting,
  };
}
