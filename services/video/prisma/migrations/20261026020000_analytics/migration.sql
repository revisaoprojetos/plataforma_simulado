-- DropForeignKey
ALTER TABLE "analytics_daily" DROP CONSTRAINT "analytics_daily_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "retention_buckets" DROP CONSTRAINT "retention_buckets_tenant_id_fkey";

-- AlterTable
ALTER TABLE "watch_sessions" ADD COLUMN     "qualities_s" JSONB,
ADD COLUMN     "rates_s" JSONB;

-- DropTable
DROP TABLE "analytics_daily";

-- DropTable
DROP TABLE "retention_buckets";

-- CreateIndex
CREATE INDEX "watch_ranges_tenant_id_lesson_id_idx" ON "watch_ranges"("tenant_id", "lesson_id");

