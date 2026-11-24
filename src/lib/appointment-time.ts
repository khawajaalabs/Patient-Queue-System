export const clinicToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export const clinicTomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
};

export const defaultBookingDate = () => {
  const karachiHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Karachi",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
  // If current local time is 17:00 (5 PM) or later, clinic hours have ended for today. Default to tomorrow.
  return karachiHour >= 17 ? clinicTomorrow() : clinicToday();
};

export function appointmentTimeLabel(clock: string) {
  const hour = Number(clock.slice(0, 2));
  return `${hour % 12 || 12}:${clock.slice(3, 5)} ${hour < 12 ? "AM" : "PM"}`;
}
