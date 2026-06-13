import type { User } from '../auth/entities/user.entity'

declare global {
  namespace Express {
    interface Request {
      user?: Pick<User, 'id' | 'email'>
    }
  }
}

export {}