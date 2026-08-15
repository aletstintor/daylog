import { getCurrentSession } from '@/app/login/lib/actions';
import fs from 'fs';
import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { canAccessFile, findAttachment, isImageMimeType, sanitizeDispositionFilename } from '@/utils/fileAccess';

export async function GET(req: NextRequest) {
  const { user } = await getCurrentSession(req);

  if (!user) {
    return Response.json({ error: 'Not allowed' }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const filePath = searchParams.get('filePath');

  if (!filePath || typeof filePath !== 'string') {
    return Response.json({ error: 'Invalid file path' }, { status: 400 });
  }

  if (!(await canAccessFile(user.id, filePath))) {
    return Response.json({ error: 'File not found' }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    // Read the file as a buffer
    buffer = fs.readFileSync(filePath);
  } catch (error) {
    console.error('Error reading file:', error);
    return Response.json({ error: 'File not found' }, { status: 404 });
  }

  // Non-image attachments are served as-is so the browser can open/download them
  const attachment = await findAttachment(filePath);
  if (attachment && !isImageMimeType(attachment.mimeType)) {
    return new Response(buffer as BodyInit, {
      headers: {
        'Content-Type': attachment.mimeType || 'application/octet-stream',
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': `inline; filename="${sanitizeDispositionFilename(attachment.fileName)}"`,
      },
    });
  }

  // Optimize image with Sharp
  const optimizedImage = await sharp(buffer)
    .resize({ width: 800 })
    .webp()
    .toBuffer();

  return new Response(Buffer.from(optimizedImage), {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': optimizedImage.length.toString(),
    },
  });
}