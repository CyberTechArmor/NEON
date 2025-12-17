-- CreateTable
CREATE TABLE "public"."MeetIntegration" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "options" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "autoJoin" BOOLEAN NOT NULL DEFAULT true,
    "defaultQuality" TEXT NOT NULL DEFAULT 'auto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID NOT NULL,

    CONSTRAINT "MeetIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetIntegration_orgId_key" ON "public"."MeetIntegration"("orgId");

-- CreateIndex
CREATE INDEX "MeetIntegration_orgId_idx" ON "public"."MeetIntegration"("orgId");
