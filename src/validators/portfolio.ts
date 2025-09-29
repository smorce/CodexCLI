import { z } from 'zod';

/**
 * This module contains Zod schemas for validating payloads related to the portfolio endpoints.
 * Centralizing schemas here improves reusability and maintainability.
 */

// Schema for the POST /portfolio/efficient-frontier endpoint.
export const efficientFrontierSchema = z.object({
  tickers: z.array(z.string().min(1), { required_error: "Tickers array is required" }).min(1, { message: "Tickers array cannot be empty" }),
  constraints: z.object({
    weight_sum: z.number().optional(),
    min_weight: z.number().optional(),
    max_weight: z.number().optional(),
  }).optional(),
  steps: z.number().int().min(10, { message: "Steps must be at least 10" }).max(100, { message: "Steps must not exceed 100" }),
});

// We can add the schema for the /optimal-weights endpoint here later.

// Define the possible objective types for optimal weight calculation.
const ObjectiveTypeEnum = z.enum([
  'MAX_SHARPE',
  'MIN_VOLATILITY',
  'EFFICIENT_RETURN',
  'EFFICIENT_RISK',
]);

// Schema for the POST /portfolio/optimal-weights endpoint.
export const optimalWeightsSchema = z.object({
  tickers: z.array(z.string().min(1), { required_error: "Tickers array is required" }).min(1, { message: "Tickers array cannot be empty" }),
  objective: z.object({
    type: ObjectiveTypeEnum,
    // targetValue is only required for certain objective types.
    targetValue: z.number().optional(),
  }),
  constraints: z.object({
    weight_sum: z.number().optional(),
    min_weight: z.number().optional(),
    max_weight: z.number().optional(),
  }).optional(),
}).superRefine((data, ctx) => {
  // Use superRefine for conditional validation.
  // If the objective is to target a specific return or risk, a targetValue must be provided.
  const needsTargetValue = ['EFFICIENT_RETURN', 'EFFICIENT_RISK'];
  if (needsTargetValue.includes(data.objective.type) && data.objective.targetValue === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['objective', 'targetValue'],
      message: 'targetValue is required for this objective type',
    });
  }
});