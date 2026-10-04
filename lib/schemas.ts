import { z } from "zod";
import { MAX_MULTIPLIER } from "./constants";
import { normaliseTime } from "./csv";

export const datasetSchema = z.enum(["real", "demo", "test"]);

export const isoTime = z
  .string()
  .max(40)
  .transform((v, ctx) => {
    const t = normaliseTime(v);
    if (!t) {
      ctx.addIssue({ code: "custom", message: "must be an ISO-8601 timestamp" });
      return z.NEVER;
    }
    return t.iso;
  });

export const multiplierSchema = z
  .number()
  .finite()
  .min(1, "multiplier must be ≥ 1.00")
  .max(MAX_MULTIPLIER)
  .transform((v) => Math.round(v * 100) / 100);

export const sourceNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_.-]+$/, "use letters, numbers, dot, dash or underscore");

export const manualRoundSchema = z.object({
  multiplier: multiplierSchema,
  round_time: isoTime.optional(),
  source: sourceNameSchema.default("manual"),
});

export const importRequestSchema = z
  .object({
    csv: z.string().min(1).max(8 * 1024 * 1024),
    file_name: z.string().max(255).optional(),
    dataset: z.enum(["real", "test"]),
    source_name: sourceNameSchema,
    collection_method: z.enum(["manual_record", "official_export", "authorized_api", "synthetic", "other"]),
    provenance_notes: z.string().trim().min(10, "describe where and how the data was obtained (≥ 10 characters)").max(4000),
    attested: z.boolean().default(false),
    collected_from: isoTime.optional(),
    collected_to: isoTime.optional(),
    accept_issues: z.boolean().default(false),
  })
  .refine((v) => v.dataset !== "real" || v.collection_method !== "synthetic", { message: "synthetic data cannot be REAL DATA", path: ["collection_method"] })
  .refine((v) => v.dataset !== "real" || v.attested, { message: "real data must be attested", path: ["attested"] });

export const deleteRoundsSchema = z.object({
  ids: z.array(z.string().max(64)).min(1).max(5000),
});

export const ingestSchema = z.object({
  source_name: sourceNameSchema,
  rounds: z.array(z.object({ multiplier: multiplierSchema, round_time: isoTime })).min(1).max(1000),
});

export const roundFilterSchema = z.object({
  from: isoTime.optional(),
  to: isoTime.optional(),
  min: z.coerce.number().min(1).optional(),
  max: z.coerce.number().min(1).optional(),
  source: sourceNameSchema.optional(),
});
