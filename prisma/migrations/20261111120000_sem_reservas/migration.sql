-- Sem reservas nem caixa do negócio: a PJ vira só mais uma conta e o DAS vira um lembrete de vencimento.
-- Saem os buckets (reservas de imposto e custo, caixa do negócio) com os lançamentos deles, o "pago com" das
-- regras, os % de reserva das fontes de renda e os alertas que dependiam disso.
DELETE FROM "Alert" WHERE "type" IN ('RESERVA_IMPOSTO_BAIXA', 'ENTRADA_SEM_STREAM');
DELETE FROM "AlertRule" WHERE "type" IN ('RESERVA_IMPOSTO_BAIXA', 'ENTRADA_SEM_STREAM');
UPDATE "AiProposal" SET "status" = 'CANCELADA' WHERE "status" = 'PENDENTE' AND "tool" = 'proporRetiradaNegocio';
-- A projeção agora é pela média do que sobrou: assinatura detectada não "entra na projeção" sozinha.
UPDATE "Alert" SET "body" = replace("body", ' Já entra na projeção.', '') WHERE "body" LIKE '% Já entra na projeção.';

-- AlterEnum
BEGIN;
CREATE TYPE "AlertType_new" AS ENUM ('GASTO_UNICO_ALTO', 'CATEGORIA_ACIMA_MEDIA', 'ASSINATURA_NOVA', 'FATURA_ACIMA_PREVISTO', 'META_ATRASADA', 'CONEXAO_ERRO', 'CONSENTIMENTO_EXPIRANDO', 'SALDO_PROJETADO_NEGATIVO', 'LIMITE_FATURAMENTO_MEI', 'OBRIGACAO_VENCENDO');
ALTER TABLE "Alert" ALTER COLUMN "type" TYPE "AlertType_new" USING ("type"::text::"AlertType_new");
ALTER TABLE "AlertRule" ALTER COLUMN "type" TYPE "AlertType_new" USING ("type"::text::"AlertType_new");
ALTER TYPE "AlertType" RENAME TO "AlertType_old";
ALTER TYPE "AlertType_new" RENAME TO "AlertType";
DROP TYPE "AlertType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Rule" DROP CONSTRAINT "Rule_bucketId_fkey";

-- DropForeignKey
ALTER TABLE "Bucket" DROP CONSTRAINT "Bucket_userId_fkey";

-- DropForeignKey
ALTER TABLE "Bucket" DROP CONSTRAINT "Bucket_revenueStreamId_fkey";

-- DropForeignKey
ALTER TABLE "BucketEntry" DROP CONSTRAINT "BucketEntry_userId_fkey";

-- DropForeignKey
ALTER TABLE "BucketEntry" DROP CONSTRAINT "BucketEntry_bucketId_fkey";

-- DropForeignKey
ALTER TABLE "BucketEntry" DROP CONSTRAINT "BucketEntry_transactionId_fkey";

-- DropForeignKey
ALTER TABLE "BucketEntry" DROP CONSTRAINT "BucketEntry_obligationId_fkey";

-- DropForeignKey
ALTER TABLE "FixedObligation" DROP CONSTRAINT "FixedObligation_bucketId_fkey";

-- AlterTable
ALTER TABLE "Rule" DROP COLUMN "bucketId";

-- AlterTable
ALTER TABLE "RevenueStream" DROP COLUMN "costReserveBps",
DROP COLUMN "taxReserveBps";

-- AlterTable
ALTER TABLE "FixedObligation" DROP COLUMN "bucketId";

-- DropTable
DROP TABLE "Bucket";

-- DropTable
DROP TABLE "BucketEntry";

-- DropEnum
DROP TYPE "BucketType";

-- DropEnum
DROP TYPE "BucketEntryKind";

