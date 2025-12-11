-- CreateTable
CREATE TABLE "public"."OrganizationFeatureFlag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "featureKey" VARCHAR(100) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationFeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationFeatureFlag_organizationId_idx" ON "public"."OrganizationFeatureFlag"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationFeatureFlag_organizationId_featureKey_key" ON "public"."OrganizationFeatureFlag"("organizationId", "featureKey");

-- AddForeignKey
ALTER TABLE "public"."OrganizationFeatureFlag" ADD CONSTRAINT "OrganizationFeatureFlag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
