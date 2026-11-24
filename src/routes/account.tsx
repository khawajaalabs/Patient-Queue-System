import { createFileRoute } from "@tanstack/react-router";
import { AccountRoute } from "@/screens/account-screen";
export { AccountRoute } from "@/screens/account-screen";

export const Route = createFileRoute("/account")({
  component: AccountRoute,
});
