-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_login" TIMESTAMP(6),
ADD COLUMN     "phone_number" VARCHAR(50),
ADD COLUMN     "photo_url" TEXT;
