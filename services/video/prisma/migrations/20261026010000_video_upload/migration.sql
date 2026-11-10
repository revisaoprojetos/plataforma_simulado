-- AlterEnum
ALTER TYPE "VideoStatus" ADD VALUE 'uploading';

-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "content_type" TEXT NOT NULL,
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "original_name" TEXT NOT NULL,
ADD COLUMN     "part_size" INTEGER,
ADD COLUMN     "size_bytes" BIGINT NOT NULL,
ADD COLUMN     "upload_id" TEXT;

