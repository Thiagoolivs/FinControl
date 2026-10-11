-- O que o balance da Pluggy não traz: aplicação automática, caixinhas, cheque especial e o saldo disponível do banco.
-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "autoInvestedCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "closingBalanceCents" INTEGER,
ADD COLUMN     "overdraftLimitCents" INTEGER,
ADD COLUMN     "overdraftUsedCents" INTEGER,
ADD COLUMN     "savedBoxes" JSONB,
ADD COLUMN     "savedCents" INTEGER NOT NULL DEFAULT 0;

