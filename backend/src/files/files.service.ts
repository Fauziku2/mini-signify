import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { extname } from 'path';
import { Repository } from 'typeorm';
import { S3Service } from '../s3/s3.service';
import { FileEntity } from './entities/file.entity';

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,
    private readonly s3Service: S3Service,
  ) {}

  async create(file: Express.Multer.File): Promise<FileEntity> {
    const storedFileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
    const s3Key = `uploads/${storedFileName}`;

    await this.s3Service.uploadFile({
      key: s3Key,
      body: file.buffer,
      contentType: file.mimetype,
    });

    const entity = this.filesRepository.create({
      originalFileName: file.originalname,
      storedFileName,
      s3Key,
      mimeType: file.mimetype,
      size: file.size,
    });

    return this.filesRepository.save(entity);
  }

  async findAll(): Promise<FileEntity[]> {
    return this.filesRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findOne(id: string): Promise<FileEntity> {
    const file = await this.filesRepository.findOne({
      where: { id },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    return file;
  }

  async remove(id: string): Promise<{ message: string }> {
    const file = await this.findOne(id);

    await this.s3Service.deleteFile(file.s3Key);
    await this.filesRepository.delete(id);

    return {
      message: 'File deleted successfully',
    };
  }
}