export const normalizeLocation = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
export function groupClinicLocations<T extends { city?: string | null; area?: string | null }>(
  clinics: T[],
) {
  const groups: { city: string; areas: { area: string; clinics: T[] }[] }[] = [];
  for (const clinic of clinics) {
    const city = clinic.city?.trim() || "Location not yet specified",
      area = clinic.area?.trim() || "Area not yet specified";
    let g = groups.find((g) => normalizeLocation(g.city) === normalizeLocation(city));
    if (!g) {
      g = { city, areas: [] };
      groups.push(g);
    }
    let a = g.areas.find((a) => normalizeLocation(a.area) === normalizeLocation(area));
    if (!a) {
      a = { area, clinics: [] };
      g.areas.push(a);
    }
    a.clinics.push(clinic);
  }
  return groups;
}
