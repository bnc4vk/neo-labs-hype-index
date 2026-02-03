-- DropForeignKey
ALTER TABLE "company_sources" DROP CONSTRAINT "company_sources_company_id_fkey";

-- DropForeignKey
ALTER TABLE "company_sources" DROP CONSTRAINT "company_sources_source_id_fkey";

-- DropForeignKey
ALTER TABLE "funding_rounds" DROP CONSTRAINT "funding_rounds_company_id_fkey";

-- DropForeignKey
ALTER TABLE "funding_rounds" DROP CONSTRAINT "funding_rounds_source_id_fkey";

-- DropForeignKey
ALTER TABLE "people" DROP CONSTRAINT "people_company_id_fkey";

-- DropForeignKey
ALTER TABLE "people" DROP CONSTRAINT "people_primary_source_id_fkey";

-- AlterTable
ALTER TABLE "companies" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "company_sources" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "funding_rounds" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "people" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sources" ALTER COLUMN "id" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_primary_source_id_fkey" FOREIGN KEY ("primary_source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_rounds" ADD CONSTRAINT "funding_rounds_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_rounds" ADD CONSTRAINT "funding_rounds_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_sources" ADD CONSTRAINT "company_sources_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_sources" ADD CONSTRAINT "company_sources_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
