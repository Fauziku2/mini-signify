import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { User } from './user.entity'

@Entity('auth_sessions')
export class AuthSession {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  sessionTokenHash: string

  @Column()
  expiresAt: Date

  @Column({ nullable: true })
  revokedAt: Date

  @CreateDateColumn()
  createdAt: Date

  @ManyToOne(() => User, (user) => user.authSessions, {
    onDelete: 'CASCADE',
  })
  user: User
}