export const priorities = ["routine", "urgent", "critical"] as const;
export const attentionTags = {
  follow_up: "Follow-up",
  needs_assistance: "Needs Assistance",
  special_attention: "Special Attention",
  review_required: "Review Required",
} as const;
export type AppointmentAttention = {
  priority: (typeof priorities)[number];
  tags: (keyof typeof attentionTags)[];
};
