import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import { AuthService } from '../auth.service'

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>()

    const cookieName = process.env.AUTH_SESSION_COOKIE_NAME ?? 'app_session'
    const sessionToken = request.cookies?.[cookieName]

    if (!sessionToken) {
      throw new UnauthorizedException('Not authenticated')
    }

    const user = await this.authService.getCurrentUser(sessionToken)

    request.user = user

    return true
  }
}