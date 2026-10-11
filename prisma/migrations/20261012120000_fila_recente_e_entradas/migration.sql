-- Categoria de entrada (não é gasto nem receita de stream) e janela da fila de revisão (padrão: 60 dias).
-- AlterEnum
ALTER TYPE "CategoryKind" ADD VALUE 'RECEITA';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "reviewWindowDays" INTEGER DEFAULT 60;

