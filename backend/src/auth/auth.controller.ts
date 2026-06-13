import { Controller, Post, Body, Res, Req, Get } from '@nestjs/common';
import type { Request, Response } from 'express'
import { AuthService } from './auth.service';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { RequestOtpSchema } from './schemas/request-otp.schema';
import type { RequestOtpDto } from './schemas/request-otp.schema'
import { VerifyOtpSchema } from './schemas/verify-otp.schema';
import type { VerifyOtpDto } from './schemas/verify-otp.schema';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Get('me')
    async me(@Req() req: Request) {
        const cookieName = process.env.AUTH_SESSION_COOKIE_NAME ?? 'app_session'
        const sessionToken = req.cookies?.[cookieName]

        const user = await this.authService.getCurrentUser(sessionToken)
        return {
            user,
        }
    }

    @Post('otp/request')
    requestOtp(
        @Body(new ZodValidationPipe(RequestOtpSchema))
        body: RequestOtpDto,
    ) {
        return this.authService.requestOtp(body)
    }

    @Post('otp/verify')
    async verifyOtp(
        @Body(new ZodValidationPipe(VerifyOtpSchema))
        body: VerifyOtpDto,
        @Res({ passthrough: true }) res: Response,
    ) {   
        const result = await this.authService.verifyOtp(body)

        res.cookie(
            process.env.AUTH_SESSION_COOKIE_NAME ?? 'app_session', 
            result.sessionToken, 
            {
                httpOnly: true,
                secure: process.env.APP_ENV !== 'local',
                sameSite: process.env.APP_ENV === 'local' ? 'lax' : 'none',
                expires: result.sessionExpiresAt,
                path: '/',
            })

        return {
            message: result.message,
            user: result.user
        }
    }

    @Post('logout')
    async logout(
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ) {
        const cookieName = process.env.AUTH_SESSION_COOKIE_NAME ?? 'app_session'
        const sessionToken = req.cookies?.[cookieName]

        await this.authService.logout(sessionToken)

        res.clearCookie(cookieName, {
            httpOnly: true,
            secure: process.env.APP_ENV !== 'local',
            sameSite: process.env.APP_ENV === 'local' ? 'lax' : 'none',
            path: '/',
        })
        
        return {
            message: 'Logged out',
        }
    }
}
    