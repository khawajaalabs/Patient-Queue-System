import { selectOption } from "./select-option";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ClinicProvider, ClinicSwitcher, currentCommandClinic } from "@/providers/clinic-provider";
const fixture = vi.hoisted(() => ({ role: "admin", api: vi.fn() }));
vi.mock("@/api/client", () => ({ api: fixture.api }));
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ profile: { id: "main-admin", role: fixture.role }, loading: false }),
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
  fixture.api.mockReset();
  fixture.role = "admin";
  window.history.replaceState(null, "", "/");
});
it("switches clinics and persists an account-specific preference including All Clinics", async () => {
  fixture.api.mockResolvedValue([
    { id: "northstar", name: "Northstar" },
    { id: "clifton", name: "Clifton" },
  ]);
  render(
    <ClinicProvider>
      <ClinicSwitcher all />
    </ClinicProvider>,
  );
  const chooser = screen.getByLabelText("Current clinic");
  await waitFor(() => expect(screen.getByLabelText("Current clinic")).toHaveTextContent("Northstar"));
  await selectOption(chooser, "Clifton");
  expect(currentCommandClinic()).toBe("clifton");
  expect(localStorage.getItem("queuecare:clinic:main-admin")).toBe("clifton");
  await selectOption(chooser, "All Clinics");
  expect(currentCommandClinic()).toBe("all");
});
it("rejects a stale or unauthorized All Clinics patient preference", async () => {
  fixture.role = "patient";
  localStorage.setItem("queuecare:clinic:main-admin", "all");
  fixture.api.mockResolvedValue([{ id: "northstar", name: "Northstar" }]);
  render(
    <ClinicProvider>
      <ClinicSwitcher />
    </ClinicProvider>,
  );
  await waitFor(() => expect(screen.getByLabelText("Current clinic")).toHaveTextContent("Northstar"));
  expect(screen.queryByRole("option", { name: "All Clinics" })).toBeNull();
});
it("keeps an explicit public display clinic without using the admin preference", async () => {
  localStorage.setItem("queuecare:clinic:main-admin", "northstar");
  window.history.replaceState(null, "", "/public-display?clinicId=clifton");
  fixture.api.mockResolvedValue([
    { id: "northstar", name: "Northstar" },
    { id: "clifton", name: "Clifton" },
  ]);
  render(
    <ClinicProvider publicOnly>
      <ClinicSwitcher />
    </ClinicProvider>,
  );
  await waitFor(() => expect(screen.getByLabelText("Current clinic")).toHaveTextContent("Clifton"));
});
import {QueueProvider,useLiveQueue} from '@/providers/queue-provider';
vi.mock('socket.io-client',()=>({io:()=>({on:()=>{},disconnect:()=>{}})}));
it('refetches the selected clinic and hides the previous queue during switching',async()=>{
 fixture.role='patient';
 const clinics=[{id:'northstar',name:'Northstar'},{id:'clifton',name:'Clifton'}];
 const state=(name:string,token:string)=>({clinic:{name,publicDisplayName:name,address:'',phone:'',department:'OPD',doctorName:'Doctor',openingTime:'09:00',closingTime:'17:00',averageConsultationMinutes:5,tokenPrefix:'A',publicDisplayShowNext:true},public:{name,displayName:name,department:'OPD',tokenPrefix:'A',averageConsultationMinutes:5,publicDisplayShowNext:true,status:'open',currentToken:token,nextTokens:[],waitingTokens:[],queueDate:'2026-10-08',updatedAt:''},mine:null,queue:[],history:[],patients:[]});
 let finish:(value:unknown)=>void=()=>{};
 fixture.api.mockImplementation((path:string)=>path==='/clinics'?Promise.resolve(clinics):path.includes('clinicId=clifton')?new Promise(resolve=>{finish=resolve;}):Promise.resolve(state('Northstar','A-001')));
 function View(){const q=useLiveQueue();return <><ClinicSwitcher/><output>{q.loadState==='ready'?`${q.clinic.name}: ${q.serving?.token}`:'Loading'}</output></>;}
 render(<ClinicProvider><QueueProvider><View/></QueueProvider></ClinicProvider>);
 await screen.findByText('Northstar: A-001');
 await selectOption(screen.getByLabelText('Current clinic'), 'Clifton');
 expect(screen.queryByText('Northstar: A-001')).toBeNull();
 await waitFor(()=>expect(fixture.api).toHaveBeenCalledWith('/patient/state?clinicId=clifton',expect.anything()));
 finish(state('Clifton','A-002'));
 await screen.findByText('Clifton: A-002');
});
