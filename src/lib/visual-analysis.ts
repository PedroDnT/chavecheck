import { z } from "zod";

export const referenceIdSchema = z.enum(["foto-001", "foto-002"]);
export type ReferenceId = z.infer<typeof referenceIdSchema>;

export const regionSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  width: z.number().finite().positive().max(1),
  height: z.number().finite().positive().max(1),
}).strict().refine(region => region.x + region.width <= 1.001 && region.y + region.height <= 1.001,
  "A região precisa caber na imagem.");
export type Region = z.infer<typeof regionSchema>;

export const referenceAnalysisSchema = z.object({
  id: z.string(), referenceId: referenceIdSchema, sha256: z.string().regex(/^[a-f0-9]{64}$/),
  model: z.string(), promptVersion: z.string(), createdAt: z.string().datetime(),
  lighting: z.string(), sharpness: z.string(), apparentColors: z.array(z.string()), limitations: z.array(z.string()),
  observations: z.array(z.object({
    id: z.string(), label: z.string(), description: z.string(),
    kind: z.enum(["finish", "mark", "object", "uncertain"]), region: regionSchema,
  }).strict()),
}).strict();
export type ReferenceAnalysis = z.infer<typeof referenceAnalysisSchema>;

export const visualResultSchema = z.object({
  status: z.enum(["conforme", "divergencia", "inconclusivo"]),
  summary: z.string(), justification: z.string(), nextAction: z.string(), needsPhoto: z.boolean(),
  quality: z.object({
    usable: z.boolean(), reason: z.string(), lighting: z.string(), sharpness: z.string(),
    viewMatch: z.enum(["same_area", "partial", "different", "unknown"]),
  }).strict(),
  findings: z.array(z.object({
    evidenceId: z.string().min(1).max(100).optional(),
    title: z.string(), referenceId: referenceIdSchema.nullable(), referenceObservationId: z.string().nullable(),
    referenceRegion: regionSchema.nullable(), currentRegion: regionSchema.nullable(),
    before: z.string(), after: z.string(), assessment: z.enum(["unchanged", "changed", "uncertain"]), reason: z.string(),
  }).strict()),
  unverified: z.array(z.string()),
}).strict();
export type VisualResult = z.infer<typeof visualResultSchema>;

export const visualAnalysisSchema = z.object({
  id: z.string(), evidenceId: z.string(), itemId: z.string(), createdAt: z.string(),
  model: z.string(), promptVersion: z.string(), imageSha256: z.string().regex(/^[a-f0-9]{64}$/),
  requirement: z.object({ condition: z.string(), source: z.string() }).strict(),
  supportingEvidence: z.array(z.object({ evidenceId: z.string().min(1).max(100), sha256: z.string().regex(/^[a-f0-9]{64}$/), createdAt: z.string().datetime() }).strict()).max(2).optional(),
  references: z.array(referenceAnalysisSchema), result: visualResultSchema,
}).strict();
export type VisualAnalysis = z.infer<typeof visualAnalysisSchema>;

const inputImageSchema = z.string().max(4_200_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/);
export const analyzeRequestSchema = z.object({
  evidenceId: z.string().min(1).max(100),
  item: z.object({
    id: z.string().min(1).max(100), room: z.string().max(100), title: z.string().min(1).max(240),
    expectedCondition: z.string().max(6_000), source: z.string().max(6_000),
  }).strict(),
  image: inputImageSchema,
  references: z.array(referenceIdSchema).max(2),
  requestReason: z.string().max(2_000).optional(),
  previousEvidence: z.array(z.object({
    evidenceId: z.string().min(1).max(100), itemId: z.string().min(1).max(100), image: inputImageSchema,
    createdAt: z.string().datetime(),
    requirement: z.object({ condition: z.string().max(6_000), source: z.string().max(6_000) }).strict(),
  }).strict()).max(2).optional(),
}).strict().superRefine((data, context) => {
  const ids = new Set([data.evidenceId]);
  for (const [index, previous] of (data.previousEvidence ?? []).entries()) {
    if (ids.has(previous.evidenceId)) context.addIssue({ code: "custom", path: ["previousEvidence", index, "evidenceId"], message: "Cada captura deve ter um identificador diferente." });
    ids.add(previous.evidenceId);
    if (previous.itemId !== data.item.id || previous.requirement.condition !== data.item.expectedCondition || previous.requirement.source !== data.item.source) {
      context.addIssue({ code: "custom", path: ["previousEvidence", index], message: "A captura anterior deve corresponder ao mesmo item e à mesma fonte e condição esperada." });
    }
  }
});
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
export const referenceRequestSchema = z.object({ references: z.array(referenceIdSchema).min(1).max(2) }).strict();
