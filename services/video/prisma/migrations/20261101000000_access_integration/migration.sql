-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "detail" JSONB;

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "ends_at" TIMESTAMP(3),
ADD COLUMN     "external_ref" TEXT,
ADD COLUMN     "revoked_at" TIMESTAMP(3),
ADD COLUMN     "starts_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "access_endpoint_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "external_id" TEXT;

-- CreateTable
CREATE TABLE "first_access_tokens" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "first_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "first_access_tokens_token_hash_key" ON "first_access_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "first_access_tokens_user_id_idx" ON "first_access_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_tenant_id_external_ref_key" ON "enrollments"("tenant_id", "external_ref");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_external_id_key" ON "users"("tenant_id", "external_id");

-- AddForeignKey
ALTER TABLE "first_access_tokens" ADD CONSTRAINT "first_access_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "first_access_tokens" ADD CONSTRAINT "first_access_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

