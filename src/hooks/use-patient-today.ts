import { useEffect, useState } from "react";
import { patientToday } from "@/domain/patient-demographics";
export function usePatientToday() {
  const [today, setToday] = useState(() => patientToday());
  useEffect(() => {
    const timer = setInterval(() => setToday(patientToday()), 30000);
    return () => clearInterval(timer);
  }, []);
  return today;
}
