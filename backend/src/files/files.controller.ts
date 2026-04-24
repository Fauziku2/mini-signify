import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { FilesService } from './files.service';

@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, callback) => {
        if (file.mimetype !== 'application/pdf') {
          return callback(new BadRequestException('Only PDF files are allowed'), false);
        }
        callback(null, true);
      },
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    return this.filesService.create(file);
  }

  @Get()
  async getFiles() {
    return this.filesService.findAll();
  }

  @Get(':id')
  async getFile(@Param('id', ParseUUIDPipe) id: string) {
    return this.filesService.findOne(id);
  }

  @Delete(':id')
  async deleteFile(@Param('id', ParseUUIDPipe) id: string) {
    return this.filesService.remove(id);
  }
}