import { createFileRoute } from "@tanstack/react-router";
import { FollowUps } from "@/components/final-operations";
export const Route = createFileRoute("/admin/follow-ups")({ component: FollowUps });
