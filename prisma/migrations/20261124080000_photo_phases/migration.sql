-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "phase" TEXT,
ADD COLUMN     "taken_on" DATE;


-- Hand-written rules (ADR-036). Existing photos have no phase ("not sorted").
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_phase_check"
  CHECK (phase IS NULL OR (purpose = 'photo' AND phase IN ('before', 'during', 'after')));
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_taken_on_check"
  CHECK (taken_on IS NULL OR purpose = 'photo');
