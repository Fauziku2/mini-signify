import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileEntity } from './entities/file.entity';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { S3Module } from 'src/s3/s3.module';

@Module({
  imports: [TypeOrmModule.forFeature([FileEntity]), S3Module],
  controllers: [FilesController],
  providers: [FilesService]
})
export class FilesModule {}