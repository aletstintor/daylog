import { getCurrentSession } from '@/app/login/lib/actions';
import { s3Client } from '@/app/api/v1/storage/lib/s3Client';
import { prisma } from '@/prisma/client';
import * as S3 from '@aws-sdk/client-s3';
import fs from 'fs';
import { NextRequest } from 'next/server';
import path from 'path';
import sharp from 'sharp';

export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { user } = await getCurrentSession(req);
    if (!user) {
      return Response.json({ error: 'Not allowed' }, { status: 401 });
    }

    const { userId } = await params;
    const record = await prisma.user.findUnique({
      where: { id: Number(userId) },
      select: { profileImage: true },
    });
    if (!record?.profileImage) {
      return Response.json({ error: 'Avatar not found' }, { status: 404 });
    }

    let buffer: Buffer;
    const match = record.profileImage.match(/^data:image\/(?:jpeg|png|webp);base64,(.+)$/);

    if (match) {
      buffer = Buffer.from(match[1], 'base64');
    } else if (record.profileImage.startsWith('S3')) {
      if (!process.env.S3_BUCKET) {
        return new Response('S3_BUCKET environment variable is not set', {
          status: 500,
        });
      }

      const command = new S3.GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: record.profileImage,
      });
      const response = await s3Client.send(command);
      const body = await response.Body?.transformToByteArray();
      buffer = Buffer.from(body ?? '');
    } else {
      const storageRoot = path.resolve(process.env.STORAGE_PATH ?? './storage');
      const filePath = path.resolve(record.profileImage);
      if (!filePath.startsWith(`${storageRoot}${path.sep}`) || !fs.existsSync(filePath)) {
        return Response.json({ error: 'Avatar not found' }, { status: 404 });
      }

      buffer = Buffer.from(fs.readFileSync(filePath));
    }

    const optimizedImage = await sharp(buffer)
      .resize(256, 256, { fit: 'cover' })
      .webp()
      .toBuffer();

    return new Response(Buffer.from(optimizedImage), {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': optimizedImage.length.toString(),
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    console.error('Error in avatar GET:', error);
    return new Response('Failed to retrieve avatar', { status: 403 });
  }
}
