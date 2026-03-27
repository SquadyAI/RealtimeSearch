-- CreateEnum
CREATE TYPE "EngineType" AS ENUM ('search', 'translate');

-- AlterTable
ALTER TABLE "Engine" ADD COLUMN "type" "EngineType" NOT NULL DEFAULT 'search';

-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN "type" "EngineType" NOT NULL DEFAULT 'search';

-- CreateIndex
CREATE INDEX "Engine_type_enabled_idx" ON "Engine"("type", "enabled");

-- CreateIndex
CREATE INDEX "ApiKey_type_active_idx" ON "ApiKey"("type", "active");
