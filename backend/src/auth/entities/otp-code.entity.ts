import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { User } from './user.entity'

@Entity('otp_codes')
export class OtpCode {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  codeHash: string

  @Column({ default: 0 })
  attempts: number

  @Column()
  expiresAt: Date

  @Column({ nullable: true })
  usedAt: Date

  @CreateDateColumn()
  createdAt: Date

  @ManyToOne(() => User, (user) => user.otpCodes, {
    onDelete: 'CASCADE',
  })
  user: User
}