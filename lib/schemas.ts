import { z } from "zod";
import { MAX_MULTIPLIER } from "./constants";
import { normaliseTime } from "./csv";

export const datasetSchema = z.enum(["real", "demo"]);

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

export const csvImportSchema = z.object({
  csv: z.string().min(1).max(8 * 1024 * 1024),
  source: sourceNameSchema.default("csv_import"),
});

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
