-- Meta de sobra do mês (placar da tela Hoje), editável em Config.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "savingsTargetBps" INTEGER NOT NULL DEFAULT 2000;

