import { z } from 'zod'

export const VerifyOtpSchema = z.object({
  email: z.email().toLowerCase(),
  otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
})

export type VerifyOtpDto = z.infer<typeof VerifyOtpSchema>