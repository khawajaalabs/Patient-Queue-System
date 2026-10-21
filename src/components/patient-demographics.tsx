import { usePatientToday } from "@/hooks/use-patient-today";
import { useState } from "react";
import { Field } from "@/components/qc";
import { SelectField } from "@/components/form-controls";
import { ageOnDate } from "@/domain/patient-demographics";
import type { PatientProfile } from "@/types/clinical";
export function PatientDemographics({
  patient,
  required = false,
}: {
  patient: PatientProfile;
  required?: boolean;
}) {
  const today = usePatientToday();
  const [dob, setDob] = useState(patient.dateOfBirth ?? "");
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <Field label="Patient name" value={patient.fullName} readOnly />
      <label className="block text-sm font-medium">
        Gender
        <SelectField
          aria-label="Gender"
          name="gender"
          className="mt-2 w-full"
          required={required}
          defaultValue={patient.gender}
        >
          <option value="">Select gender</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
          <option value="prefer_not_to_say">Prefer not to say</option>
        </SelectField>
      </label>
      <Field
        label="Date of birth"
        name="dateOfBirth"
        type="date"
        required={required}
        max={today}
        value={dob}
        onChange={(e) => setDob(e.target.value)}
      />
      <Field label="Age (years)" value={ageOnDate(dob, today) ?? ""} readOnly />
    </section>
  );
}
