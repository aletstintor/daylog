import { getCurrentSession } from '@/app/login/lib/actions';
import * as S3 from '@aws-sdk/client-s3';
import { NextRequest } from 'next/server';
import { s3Client } from './lib/s3Client';
import sharp from 'sharp';
import { canAccessFile, findAttachment, isImageMimeType, sanitizeDispositionFilename } from '@/utils/fileAccess';

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentSession(req);

    if (!user) {
      return Response.json({ error: 'Not allowed' });
    }

    if (!process.env.S3_BUCKET) {
      return new Response('S3_BUCKET environment variable is not set', {
        status: 500,
      });
    }

    const key = req.nextUrl.searchParams.get('key') || '';

    if (!key) {
      return new Response('Key is required', { status: 400 });
    }

    if (!(await canAccessFile(user.id, key))) {
      return Response.json({ error: 'File not found' });
    }

    const command = new S3.GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
    });

    const response = await s3Client.send(command);

    const body = await response.Body?.transformToByteArray();
    const buffer = Buffer.from(body ?? '');

    // Non-image attachments are served as-is so the browser can open/download them
    const attachment = await findAttachment(key);
    if (attachment && !isImageMimeType(attachment.mimeType)) {
      return new Response(buffer as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': attachment.mimeType || 'application/octet-stream',
          'Content-Length': buffer.length.toString(),
          'Content-Disposition': `inline; filename="${sanitizeDispositionFilename(attachment.fileName)}"`,
        },
      });
    }

    // Optimize image with Sharp
    const optimizedImage = await sharp(buffer)
      .resize({ width: 480 })
      .webp()
      .toBuffer();

    return new Response(Buffer.from(optimizedImage), {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
      },
    });
  } catch (error) {
    console.error('Error in GET:', error);
    return new Response('Failed to retrieve file', { status: 403 });
  }
}