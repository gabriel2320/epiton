import { z } from "zod";

export const loginSchema = z.object({
  baseUrl: z.string().url(),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});

export type LoginValues = z.infer<typeof loginSchema>;

export const partySchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().optional().nullable(),
  active: z.boolean().default(true),
});

export type PartyValues = z.infer<typeof partySchema>;
