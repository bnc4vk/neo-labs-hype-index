ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "funding_rounds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "people" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sources" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read companies" ON "companies";
CREATE POLICY "Allow public read companies"
  ON "companies"
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow public read company_sources" ON "company_sources";
CREATE POLICY "Allow public read company_sources"
  ON "company_sources"
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow public read funding_rounds" ON "funding_rounds";
CREATE POLICY "Allow public read funding_rounds"
  ON "funding_rounds"
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow public read sources" ON "sources";
CREATE POLICY "Allow public read sources"
  ON "sources"
  FOR SELECT
  TO anon, authenticated
  USING (true);
