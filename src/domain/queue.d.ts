export function clinicDayKey(date?: Date): string;
export function patientPosition(
  tokens: { tokenCode: string; status: string; queueOrder: number }[],
  tokenCode: string,
  averageMinutes: number,
): { ahead: number; eta: number };
export function publicProjection(
  clinic: Record<string, unknown>,
  queue: Record<string, unknown> | null,
  tokens?: Record<string, unknown>[],
): Record<string, unknown>;
