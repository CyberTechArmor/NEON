-- CreateTable
CREATE TABLE "public"."FileShare" (
    "id" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "passwordHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "maxOpens" INTEGER,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "label" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ShareAccessLog" (
    "id" UUID NOT NULL,
    "shareId" UUID NOT NULL,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" INET,
    "userAgent" TEXT,
    "geoCountry" VARCHAR(2),
    "geoCity" VARCHAR(100),
    "actionType" VARCHAR(20) NOT NULL,

    CONSTRAINT "ShareAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FileShare_token_key" ON "public"."FileShare"("token");

-- CreateIndex
CREATE INDEX "FileShare_token_idx" ON "public"."FileShare"("token");

-- CreateIndex
CREATE INDEX "FileShare_fileId_idx" ON "public"."FileShare"("fileId");

-- CreateIndex
CREATE INDEX "FileShare_createdById_idx" ON "public"."FileShare"("createdById");

-- CreateIndex
CREATE INDEX "ShareAccessLog_shareId_idx" ON "public"."ShareAccessLog"("shareId");

-- CreateIndex
CREATE INDEX "ShareAccessLog_accessedAt_idx" ON "public"."ShareAccessLog"("accessedAt");

-- AddForeignKey
ALTER TABLE "public"."FileShare" ADD CONSTRAINT "FileShare_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "public"."File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FileShare" ADD CONSTRAINT "FileShare_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ShareAccessLog" ADD CONSTRAINT "ShareAccessLog_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "public"."FileShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
