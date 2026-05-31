import { getCurrentSession } from '@/app/login/lib/actions';
import { prisma } from '@/prisma/client';
import fs from 'fs';
import { NextRequest } from 'next/server';
import sharp from 'sharp';

export async function GET(req: NextRequest) {
  const { user } = await getCurrentSession(req);

  if (!user) {
    return Response.json({ error: 'Not allowed' }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const filePath = searchParams.get('filePath');

  if (!filePath) {
    return Response.json({ error: 'Invalid file path' }, { status: 400 });
  }

  // Validate if the image belongs to current user OR they are a share recipient
  const userImages = await prisma.board.findFirst({
    where: {
      userId: user.id,
      OR: [{ imageUrl: filePath }, { notes: { some: { imageUrl: filePath } } }],
    },
  });

  const userPictures = await prisma.picture.findMany({
    where: {
      imageUrl: filePath,
      OR: [{ notes: { boards: { userId: user.id } } }],
    },
  });

  const sharedImage = !userImages && !userPictures.length && await prisma.share.findFirst({
    where: {
      scope: 'SPECIFIC',
      recipients: { some: { userId: user.id } },
      OR: [
        { entityType: 'NOTE',  entityId: { in: await prisma.note.findMany({ where: { imageUrl: filePath }, select: { id: true } }).then(r => r.map(n => n.id)) } },
        { entityType: 'BOARD', entityId: { in: await prisma.board.findMany({ where: { imageUrl: filePath }, select: { id: true } }).then(r => r.map(b => b.id)) } },
      ],
    },
  });

  if (!userImages && !userPictures.length && !sharedImage) {
    return Response.json({ error: 'Image or picture not found' }, { status: 404 });
  }

  if (typeof filePath !== 'string') {
    return Response.json({ error: 'Invalid file path' }, { status: 400 });
  }

  // Read the image file as a buffer
  const imageBuffer = fs.readFileSync(filePath);
  const buffer = Buffer.from(imageBuffer);

  // Optimize image with Sharp
  const optimizedImage = await sharp(buffer)
    .resize({ width: 800 })
    .webp()
    .toBuffer();

  if (imageBuffer) {
    return new Response(Buffer.from(optimizedImage), {
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': optimizedImage.length.toString(),
      },
    });
  } else {
    return new Response('File not found or could not be converted', {
      status: 404,
    });
  }
}
