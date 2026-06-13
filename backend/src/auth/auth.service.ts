import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository, MoreThan } from 'typeorm';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { RequestOtpDto } from './schemas/request-otp.schema';
import { VerifyOtpDto } from './schemas/verify-otp.schema';
import { User } from './entities/user.entity';
import { OtpCode } from './entities/otp-code.entity';
import { AuthSession } from './entities/auth-session.entity'

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,

        @InjectRepository(OtpCode)
        private readonly otpCodeRepository: Repository<OtpCode>,

        @InjectRepository(AuthSession)
        private readonly authSessionRepository: Repository<AuthSession>,
    ) {}

    async requestOtp(body: RequestOtpDto) {
        // Find existing user by email.
        let user = await this.userRepository.findOne({
            where: { email: body.email },
        });

        if (!user) {
            // Create a new user if this email has not logged in before.
            user = this.userRepository.create({
                email: body.email,
            });
            
            await this.userRepository.save(user)
        }

        // Generate a 6-digit OTP for the user.
        const otp = this.generateOtp()
        const codeHash = this.hashValue(otp)

        // Calculate when the OTP should expire.
        const otpTtlMinutes = Number(process.env.OTP_TTL_MINUTES ?? 10)
        const expiresAt = new Date(Date.now() + otpTtlMinutes * 60 * 1000)

        // Create a new OTP record linked to the user.
        const otpCode = this.otpCodeRepository.create({
            user,
            codeHash,
            expiresAt,
        });

        await this.otpCodeRepository.save(otpCode);

        // Print OTP locally for development until real email sending is added.
        console.log(`[DEV OTP] Email: ${body.email}, OTP: ${otp}`)

        return {
            message: 'OTP sent',
        };
    }

    async verifyOtp(body: VerifyOtpDto) {
        // Find the user who requested the OTP.
        const user = await this.userRepository.findOne({
            where: { email: body.email },
        });

        if (!user) {
            throw new UnauthorizedException('Invalid OTP')
        } 

        // Find the latest unused OTP for this user.
        const otpCode = await this.otpCodeRepository.findOne({
            where: {
                user: { id: user.id },
                usedAt: IsNull(),
            },
            order: { createdAt: 'DESC' },
        })

        if (!otpCode) {
            throw new UnauthorizedException('Invalid OTP')
        }

        // Reject the OTP if it has already expired.
        const now = new Date()

        if (otpCode.expiresAt < now) {
            throw new UnauthorizedException('OTP has expired')
        }

        // Reject the OTP if the user has exceeded the allowed attempts.
        const otpMaxAttempts = Number(process.env.OTP_MAX_ATTEMPTS ?? 5)

        if (otpCode.attempts >= otpMaxAttempts) {
            throw new UnauthorizedException('Too many OTP attempts')
        }

        // Hash the submitted OTP so we can compare hash with hash.
        const submittedCodeHash = this.hashValue(body.otp)

        // Compare the submitted OTP hash with the stored OTP hash.
        if (!this.safelyCompareHashes(submittedCodeHash, otpCode.codeHash)) {
            // Increase attempt count when the submitted OTP is wrong.
            otpCode.attempts += 1
            await this.otpCodeRepository.save(otpCode)

            throw new UnauthorizedException('Invalid OTP')
        }

        // Mark the OTP as used so it cannot be reused.
        otpCode.usedAt = now
        await this.otpCodeRepository.save(otpCode)

        // Generate a long random session token for the logged-in browser.
        const sessionToken = this.generateSessionToken()

        // Store only the hashed session token, not the plain token.
        const sessionTokenHash = this.hashValue(sessionToken)

        const sessionTtlDays = Number(process.env.SESSION_TTL_DAYS ?? 7)
        const sessionExpiresAt = new Date(
            Date.now() + sessionTtlDays * 24 * 60 * 60 * 1000,
        )

        // Create a new auth session linked to the user.
        const authSession = this.authSessionRepository.create({
            user,
            sessionTokenHash,
            expiresAt: sessionExpiresAt,
        });

        await this.authSessionRepository.save(authSession);

        return {
            message: 'OTP verified',
            sessionToken,
            sessionExpiresAt,
            user: {
                id: user.id,
                email: user.email,
            },
        }
    }

    async getCurrentUser(sessionToken?: string) {
        // Reject the request if there is no session cookie.
        if (!sessionToken) {
            throw new UnauthorizedException('Not authenticated')
        }

        // Hash the session token from the cookie before checking the database.
        const sessionTokenHash = this.hashValue(sessionToken)

        // Find a valid, active session that has not expired or been revoked.
        const authSession = await this.authSessionRepository.findOne({
            where: {
                sessionTokenHash,
                revokedAt: IsNull(),
                expiresAt: MoreThan(new Date()),
            },
            relations: {
                user: true,
            },
        })
        
        if (!authSession) {
            throw new UnauthorizedException('Not authenticated')
        }
        
        return {
            id: authSession.user.id,
            email: authSession.user.email,
        }
    }

    async logout(sessionToken?: string) {
        // If there is no session cookie, logout can still be treated as successful.
        if (!sessionToken) return

        // Hash the session token from the cookie before checking the database.
        const sessionTokenHash = this.hashValue(sessionToken)

        // Find the active session for this cookie.
        const authSession = await this.authSessionRepository.findOne({
            where: {
                sessionTokenHash,
                revokedAt: IsNull(),
            },
        })
        
        if (!authSession) return

        // Mark the session as revoked so it can no longer be used.
        authSession.revokedAt = new Date()
        await this.authSessionRepository.save(authSession)
    }

    private generateOtp() {
        return randomInt(100000, 1000000).toString()
    }

    private generateSessionToken() {
        return randomBytes(32).toString('hex')
    }
    
    private hashValue(value: string) {
        const secret = process.env.AUTH_SESSION_SECRET

        if (!secret) {
            throw new Error('AUTH_SESSION_SECRET is not configured')
        }

        return createHmac('sha256', secret).update(value).digest('hex')
    }

    private safelyCompareHashes(hashA: string, hashB: string) {
        const bufferA = Buffer.from(hashA, 'hex')
        const bufferB = Buffer.from(hashB, 'hex')
        
        // Return false early because timingSafeEqual requires buffers of the same length.
        if (bufferA.length !== bufferB.length) {
            return false}
            
        // Compare hashes using constant-time comparison to reduce timing attack risk.
        return timingSafeEqual(bufferA, bufferB)
    }
}
