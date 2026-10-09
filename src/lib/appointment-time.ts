export const clinicToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export function appointmentTimeLabel(clock: string) {
  const hour = Number(clock.slice(0, 2));
  return `${hour % 12 || 12}:${clock.slice(3, 5)} ${hour < 12 ? "AM" : "PM"}`;
}
