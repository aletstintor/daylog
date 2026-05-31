-- AlterTable
ALTER TABLE "Share" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "sharedBy" INTEGER;

-- CreateTable
CREATE TABLE "ShareRecipient" (
    "id" SERIAL NOT NULL,
    "shareId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "ShareRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShareRecipient_userId_idx" ON "ShareRecipient"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareRecipient_shareId_userId_key" ON "ShareRecipient"("shareId", "userId");

-- CreateIndex
CREATE INDEX "Share_scope_idx" ON "Share"("scope");

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_sharedBy_fkey" FOREIGN KEY ("sharedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareRecipient" ADD CONSTRAINT "ShareRecipient_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "Share"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareRecipient" ADD CONSTRAINT "ShareRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
