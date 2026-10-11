-- Aportes e fotos de meta ganham userId direto (filtro por coluna, nunca por join). As tabelas estavam vazias: metas não tinham tela.
-- AlterTable
ALTER TABLE "GoalContribution" ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "GoalSnapshot" ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "GoalContribution_userId_idx" ON "GoalContribution"("userId");

-- CreateIndex
CREATE INDEX "GoalSnapshot_userId_idx" ON "GoalSnapshot"("userId");

-- AddForeignKey
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalSnapshot" ADD CONSTRAINT "GoalSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

