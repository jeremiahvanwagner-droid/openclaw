/**
 * lib/schemas/ghl-webhook.schema.mjs
 *
 * Zod v3 schemas for GoHighLevel webhook payloads.
 * Used in handlers/ghl-webhook-handler.mjs to validate incoming events
 * before they reach business-logic event handlers.
 *
 * Every handler receives an `enrichedPayload` that already has `trace_id`
 * and `webhook_auth_strategy` merged in, so only the GHL-originating fields
 * are validated here.
 */
import { z } from "zod";

// ─── Shared sub-objects ───────────────────────────────────────────────────────

const ContactSchema = z.object({
  id:          z.string().optional(),
  firstName:   z.string().optional(),
  lastName:    z.string().optional(),
  name:        z.string().optional(),
  email:       z.string().optional(),
  phone:       z.string().optional(),
  source:      z.string().optional(),
  customFields: z.record(z.unknown()).optional(),
  tags:        z.array(z.string()).optional(),
}).passthrough();

const CalendarSchema = z.object({
  id:   z.string().optional(),
  name: z.string().optional(),
}).passthrough();

const OpportunitySchema = z.object({
  id:             z.string().optional(),
  pipelineStage:  z.string().optional(),
  status:         z.string().optional(),
  monetaryValue:  z.number().optional(),
}).passthrough();

const PlanSchema = z.object({
  id:   z.string().optional(),
  name: z.string().optional(),
}).passthrough();

const ProductSchema = z.object({
  id:   z.string().optional(),
  name: z.string().optional(),
}).passthrough();

// ─── Per-event payload schemas ────────────────────────────────────────────────

export const ContactCreatedPayloadSchema = z.object({
  contact: ContactSchema.optional(),
}).passthrough();

export const ContactUpdatedPayloadSchema = ContactCreatedPayloadSchema;

export const TagAddedPayloadSchema = z.object({
  contact: ContactSchema.optional(),
  tag:     z.string().optional(),
}).passthrough();

export const FormSubmittedPayloadSchema = z.object({
  contact:  ContactSchema.optional(),
  formName: z.string().optional(),
  form:     z.object({ name: z.string().optional() }).passthrough().optional(),
  fields:   z.record(z.unknown()).optional(),
  formData: z.record(z.unknown()).optional(),
}).passthrough();

export const PageVisitPayloadSchema = z.object({
  contact:  ContactSchema.optional(),
  page:     z.string().optional(),
  pagePath: z.string().optional(),
}).passthrough();

export const PaymentPayloadSchema = z.object({
  contact:     ContactSchema.optional(),
  amount:      z.number().optional(),
  payment:     z.object({ amount: z.number().optional() }).passthrough().optional(),
  product:     ProductSchema.optional(),
  productName: z.string().optional(),
}).passthrough();

export const SubscriptionPayloadSchema = z.object({
  contact:      ContactSchema.optional(),
  plan:         PlanSchema.optional(),
  subscription: z.object({
    name:   z.string().optional(),
    amount: z.number().optional(),
  }).passthrough().optional(),
  amount:       z.number().optional(),
  reason:       z.string().optional(),
}).passthrough();

export const AppointmentPayloadSchema = z.object({
  contact:   ContactSchema.optional(),
  calendar:  CalendarSchema.optional(),
  startTime: z.string().optional(),
  appointment: z.object({ startTime: z.string().optional() }).passthrough().optional(),
}).passthrough();

export const OpportunityPayloadSchema = z.object({
  contact:     ContactSchema.optional(),
  opportunity: OpportunitySchema.optional(),
  newStage:    z.string().optional(),
  newStatus:   z.string().optional(),
  monetaryValue: z.number().optional(),
}).passthrough();

// ─── Event-type → schema map ──────────────────────────────────────────────────

export const GHL_PAYLOAD_SCHEMAS = {
  "contact.created":            ContactCreatedPayloadSchema,
  "contact.updated":            ContactUpdatedPayloadSchema,
  "contact.tag.added":          TagAddedPayloadSchema,
  "contact.tag.updated":        TagAddedPayloadSchema,
  "form.submitted":             FormSubmittedPayloadSchema,
  "funnel.page.visited":        PageVisitPayloadSchema,
  "payment.received":           PaymentPayloadSchema,
  "subscription.created":       SubscriptionPayloadSchema,
  "subscription.cancelled":     SubscriptionPayloadSchema,
  "appointment.created":        AppointmentPayloadSchema,
  "appointment.cancelled":      AppointmentPayloadSchema,
  "appointment.noshow":         AppointmentPayloadSchema,
  "opportunity.created":        OpportunityPayloadSchema,
  "opportunity.stage.changed":  OpportunityPayloadSchema,
  "opportunity.status.changed": OpportunityPayloadSchema,
};

/**
 * Validate a GHL webhook payload against its registered schema.
 * Returns { success: true, data } or { success: false, error: ZodError }.
 * If the eventType has no registered schema, returns { success: true, data: payload }
 * (passthrough — new/unknown event types are not rejected).
 *
 * @param {string} eventType
 * @param {unknown} payload
 */
export function validateGhlWebhookPayload(eventType, payload) {
  const schema = GHL_PAYLOAD_SCHEMAS[eventType];
  if (!schema) {
    return { success: true, data: payload };
  }
  return schema.safeParse(payload);
}
