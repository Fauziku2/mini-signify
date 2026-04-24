import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class S3Service {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    const bucketName = this.configService.get<string>('AWS_S3_BUCKET_NAME');

    if (!region || !accessKeyId || !secretAccessKey || !bucketName) {
      throw new Error('Missing required AWS S3 configuration');
    }

    this.bucketName = bucketName;

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadFile(params: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
      });

      await this.s3Client.send(command);
    } catch (error) {
      console.error('Failed to upload file to S3', error);
      throw new InternalServerErrorException('Failed to upload file to S3');
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
    } catch (error) {
      console.error('Failed to delete file from S3', error);
      throw new InternalServerErrorException('Failed to delete file from S3');
    }
  }
}