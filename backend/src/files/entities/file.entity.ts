import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'files' })
export class FileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  originalFileName: string;

  @Column({ unique: true })
  storedFileName: string;

  @Column({ unique: true })
  s3Key: string;

  @Column()
  mimeType: string;

  @Column('bigint')
  size: number;

  @CreateDateColumn()
  createdAt: Date;
}