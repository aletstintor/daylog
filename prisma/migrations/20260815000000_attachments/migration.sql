-- CreateTable
CREATE TABLE "Attachment" (
    "id" SERIAL NOT NULL,
    "notesId" INTEGER,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attachment_notesId_idx" ON "Attachment"("notesId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_notesId_fkey" FOREIGN KEY ("notesId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;