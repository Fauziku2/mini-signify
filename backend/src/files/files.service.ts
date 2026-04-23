import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { Repository } from 'typeorm';
import { FileEntity } from './entities/file.entity';

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,
  ) {}

  async create(file: Express.Multer.File): Promise<FileEntity> {
    const entity = this.filesRepository.create({
      originalFileName: file.originalname,
      storedFileName: file.filename,
      filePath: file.path,
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

    try {
      await unlink(join(process.cwd(), file.filePath));
    } catch {
      // ignore if file already missing on disk
    }

    await this.filesRepository.delete(id);

    return {
      message: 'File deleted successfully',
    };
  }
}