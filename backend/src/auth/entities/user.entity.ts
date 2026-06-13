import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { AuthSession } from './auth-session.entity'
import { OtpCode } from './otp-code.entity'

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ unique: true })
  email: string

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @OneToMany(() => OtpCode, (otpCode) => otpCode.user)
  otpCodes: OtpCode[]

  @OneToMany(() => AuthSession, (authSession) => authSession.user)
  authSessions: AuthSession[]
}