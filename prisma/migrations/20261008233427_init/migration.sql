-- CreateEnum
CREATE TYPE "Scope" AS ENUM ('PF', 'PJ');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CHECKING', 'SAVINGS', 'CREDIT', 'INVESTMENT');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('CREATED', 'UPDATING', 'UPDATED', 'WAITING_USER_INPUT', 'LOGIN_ERROR', 'OUTDATED');

-- CreateEnum
CREATE TYPE "SyncTrigger" AS ENUM ('CRON', 'MANUAL');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('EM_ANDAMENTO', 'SUCESSO', 'ERRO');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'POSTED');

-- CreateEnum
CREATE TYPE "RevenueStreamType" AS ENUM ('SALARIO_FIXO', 'PROJETO', 'VENTURE', 'OUTRO');

-- CreateEnum
CREATE TYPE "BucketType" AS ENUM ('RESERVA_IMPOSTO', 'RESERVA_CUSTO', 'DISPONIVEL', 'CAIXA_PROJETO');

-- CreateEnum
CREATE TYPE "BucketEntryKind" AS ENUM ('ALOCACAO', 'OBRIGACAO_FIXA', 'PAGAMENTO', 'RETIRADA', 'AJUSTE');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('ESSENCIAL', 'VARIAVEL', 'INVESTIMENTO', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('PREFIX', 'CONTAINS', 'REGEX');

-- CreateEnum
CREATE TYPE "RuleOrigin" AS ENUM ('MANUAL', 'IA_CONFIRMADA');

-- CreateEnum
CREATE TYPE "RuleDirection" AS ENUM ('AMBAS', 'ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDENTE', 'ACEITA', 'CORRIGIDA', 'IGNORADA');

-- CreateEnum
CREATE TYPE "RecurrenceStatus" AS ENUM ('ATIVA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ATIVA', 'PAUSADA', 'CONCLUIDA', 'ARQUIVADA');

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('ACAO', 'FII', 'RENDA_FIXA', 'CRIPTO', 'FUNDO');

-- CreateEnum
CREATE TYPE "HoldingOrigin" AS ENUM ('PLUGGY', 'MANUAL');

-- CreateEnum
CREATE TYPE "BenchmarkSeries" AS ENUM ('CDI', 'SELIC', 'IPCA');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('GASTO_UNICO_ALTO', 'CATEGORIA_ACIMA_MEDIA', 'ASSINATURA_NOVA', 'FATURA_ACIMA_PREVISTO', 'META_ATRASADA', 'CONEXAO_ERRO', 'CONSENTIMENTO_EXPIRANDO', 'SALDO_PROJETADO_NEGATIVO', 'RESERVA_IMPOSTO_BAIXA', 'ENTRADA_SEM_STREAM', 'LIMITE_FATURAMENTO_MEI');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('BAIXA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'MODEL', 'TOOL');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDENTE', 'CONFIRMADA', 'CANCELADA', 'EXPIRADA');

-- CreateEnum
CREATE TYPE "AuditOrigin" AS ENUM ('USER', 'AI');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "totpSecretEnc" TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "totpLastStep" INTEGER,
    "name" TEXT,
    "aboutMe" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "mfaVerifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "Scope" NOT NULL,
    "pluggyItemId" TEXT NOT NULL,
    "connectorId" INTEGER NOT NULL,
    "institutionName" TEXT NOT NULL,
    "institutionLogo" TEXT,
    "status" "ConnectionStatus" NOT NULL,
    "statusDetail" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "consentExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "trigger" "SyncTrigger" NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "stats" JSONB,
    "error" TEXT,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT,
    "pluggyAccountId" TEXT,
    "scope" "Scope" NOT NULL,
    "type" "AccountType" NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT,
    "balanceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "creditLimitCents" INTEGER,
    "availableCreditCents" INTEGER,
    "includeInTotals" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCardBill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "pluggyBillId" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "totalAmountCents" INTEGER NOT NULL,
    "minimumPaymentCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCardBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "scope" "Scope" NOT NULL,
    "pluggyTransactionId" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'POSTED',
    "date" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "descriptionRaw" TEXT NOT NULL,
    "descriptionClean" TEXT NOT NULL,
    "providerCategory" TEXT,
    "categoryId" TEXT,
    "ruleId" TEXT,
    "revenueStreamId" TEXT,
    "suggestionId" TEXT,
    "recurringSeriesId" TEXT,
    "transferPeerId" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "isIgnored" BOOLEAN NOT NULL DEFAULT false,
    "installmentCurrent" INTEGER,
    "installmentTotal" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "matchType" "MatchType" NOT NULL,
    "direction" "RuleDirection" NOT NULL DEFAULT 'AMBAS',
    "scope" "Scope",
    "categoryId" TEXT,
    "revenueStreamId" TEXT,
    "bucketId" TEXT,
    "priority" INTEGER NOT NULL,
    "origin" "RuleOrigin" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "lastHitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleSuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "matchType" "MatchType" NOT NULL,
    "categoryId" TEXT,
    "revenueStreamId" TEXT,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDENTE',
    "ruleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "RuleSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringSeries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "Scope" NOT NULL,
    "key" TEXT NOT NULL,
    "avgAmountCents" INTEGER NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "occurrences" INTEGER NOT NULL,
    "lastDate" DATE NOT NULL,
    "nextExpectedDate" DATE NOT NULL,
    "status" "RecurrenceStatus" NOT NULL DEFAULT 'ATIVA',
    "categoryId" TEXT,
    "revenueStreamId" TEXT,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueStream" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "Scope" NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RevenueStreamType" NOT NULL,
    "color" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "taxReserveBps" INTEGER NOT NULL DEFAULT 0,
    "costReserveBps" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueStream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bucket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "Scope" NOT NULL,
    "revenueStreamId" TEXT,
    "name" TEXT NOT NULL,
    "type" "BucketType" NOT NULL,
    "color" TEXT NOT NULL,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BucketEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "kind" "BucketEntryKind" NOT NULL,
    "date" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "transactionId" TEXT,
    "obligationId" TEXT,
    "competence" TEXT,
    "transferGroupId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BucketEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedObligation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "Scope" NOT NULL,
    "bucketId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "Scope" NOT NULL,
    "name" TEXT NOT NULL,
    "targetCents" INTEGER NOT NULL,
    "currentCents" INTEGER NOT NULL DEFAULT 0,
    "targetDate" DATE NOT NULL,
    "monthlyRequiredCents" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'ATIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalContribution" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "transactionId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalSnapshot" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "currentCents" INTEGER NOT NULL,
    "monthlyRequiredCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "pluggyInvestmentId" TEXT,
    "ticker" TEXT,
    "name" TEXT NOT NULL,
    "assetClass" "AssetClass" NOT NULL,
    "origin" "HoldingOrigin" NOT NULL,
    "quantity" DECIMAL(28,10) NOT NULL,
    "avgPriceCents" INTEGER NOT NULL,
    "currentValueCents" INTEGER,
    "maturityDate" DATE,
    "indexer" TEXT,
    "valueUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationTarget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetClass" "AssetClass" NOT NULL,
    "targetBps" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllocationTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "ticker" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "changeBps" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("ticker")
);

-- CreateTable
CREATE TABLE "BenchmarkRate" (
    "series" "BenchmarkSeries" NOT NULL,
    "date" DATE NOT NULL,
    "value" DECIMAL(12,8) NOT NULL,

    CONSTRAINT "BenchmarkRate_pkey" PRIMARY KEY ("series","date")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alertRuleId" TEXT,
    "scope" "Scope" NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "Severity" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "pushedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "params" JSONB NOT NULL,
    "severity" "Severity" NOT NULL,
    "push" BOOLEAN NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiProposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatMessageId" TEXT,
    "tool" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "preview" JSONB NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDENTE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "origin" "AuditOrigin" NOT NULL,
    "proposalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_pluggyItemId_key" ON "Connection"("pluggyItemId");

-- CreateIndex
CREATE INDEX "Connection_userId_idx" ON "Connection"("userId");

-- CreateIndex
CREATE INDEX "SyncRun_userId_trigger_startedAt_idx" ON "SyncRun"("userId", "trigger", "startedAt");

-- CreateIndex
CREATE INDEX "SyncRun_connectionId_startedAt_idx" ON "SyncRun"("connectionId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Account_pluggyAccountId_key" ON "Account"("pluggyAccountId");

-- CreateIndex
CREATE INDEX "Account_userId_scope_idx" ON "Account"("userId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCardBill_pluggyBillId_key" ON "CreditCardBill"("pluggyBillId");

-- CreateIndex
CREATE INDEX "CreditCardBill_accountId_dueDate_idx" ON "CreditCardBill"("accountId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_pluggyTransactionId_key" ON "Transaction"("pluggyTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_transferPeerId_key" ON "Transaction"("transferPeerId");

-- CreateIndex
CREATE INDEX "Transaction_userId_scope_date_idx" ON "Transaction"("userId", "scope", "date");

-- CreateIndex
CREATE INDEX "Transaction_accountId_date_idx" ON "Transaction"("accountId", "date");

-- CreateIndex
CREATE INDEX "Transaction_userId_categoryId_idx" ON "Transaction"("userId", "categoryId");

-- CreateIndex
CREATE INDEX "Transaction_userId_revenueStreamId_idx" ON "Transaction"("userId", "revenueStreamId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_parentId_name_key" ON "Category"("userId", "parentId", "name");

-- CreateIndex
CREATE INDEX "Rule_userId_active_priority_idx" ON "Rule"("userId", "active", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "RuleSuggestion_ruleId_key" ON "RuleSuggestion"("ruleId");

-- CreateIndex
CREATE INDEX "RuleSuggestion_userId_status_idx" ON "RuleSuggestion"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringSeries_userId_scope_key_key" ON "RecurringSeries"("userId", "scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueStream_userId_name_key" ON "RevenueStream"("userId", "name");

-- CreateIndex
CREATE INDEX "Bucket_userId_scope_idx" ON "Bucket"("userId", "scope");

-- CreateIndex
CREATE INDEX "BucketEntry_bucketId_date_idx" ON "BucketEntry"("bucketId", "date");

-- CreateIndex
CREATE INDEX "BucketEntry_transactionId_idx" ON "BucketEntry"("transactionId");

-- CreateIndex
CREATE INDEX "BucketEntry_transferGroupId_idx" ON "BucketEntry"("transferGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "BucketEntry_obligationId_competence_key" ON "BucketEntry"("obligationId", "competence");

-- CreateIndex
CREATE INDEX "Goal_userId_status_idx" ON "Goal"("userId", "status");

-- CreateIndex
CREATE INDEX "GoalContribution_goalId_date_idx" ON "GoalContribution"("goalId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "GoalSnapshot_goalId_month_key" ON "GoalSnapshot"("goalId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_pluggyInvestmentId_key" ON "Holding"("pluggyInvestmentId");

-- CreateIndex
CREATE INDEX "Holding_userId_assetClass_idx" ON "Holding"("userId", "assetClass");

-- CreateIndex
CREATE UNIQUE INDEX "AllocationTarget_userId_assetClass_key" ON "AllocationTarget"("userId", "assetClass");

-- CreateIndex
CREATE INDEX "Alert_userId_readAt_createdAt_idx" ON "Alert"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_userId_dedupeKey_key" ON "Alert"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "AlertRule_userId_active_idx" ON "AlertRule"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "ChatMessage_userId_createdAt_idx" ON "ChatMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiProposal_userId_status_idx" ON "AiProposal"("userId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardBill" ADD CONSTRAINT "CreditCardBill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardBill" ADD CONSTRAINT "CreditCardBill_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_revenueStreamId_fkey" FOREIGN KEY ("revenueStreamId") REFERENCES "RevenueStream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "RuleSuggestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringSeriesId_fkey" FOREIGN KEY ("recurringSeriesId") REFERENCES "RecurringSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_transferPeerId_fkey" FOREIGN KEY ("transferPeerId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_revenueStreamId_fkey" FOREIGN KEY ("revenueStreamId") REFERENCES "RevenueStream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "Bucket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleSuggestion" ADD CONSTRAINT "RuleSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleSuggestion" ADD CONSTRAINT "RuleSuggestion_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleSuggestion" ADD CONSTRAINT "RuleSuggestion_revenueStreamId_fkey" FOREIGN KEY ("revenueStreamId") REFERENCES "RevenueStream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleSuggestion" ADD CONSTRAINT "RuleSuggestion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringSeries" ADD CONSTRAINT "RecurringSeries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringSeries" ADD CONSTRAINT "RecurringSeries_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringSeries" ADD CONSTRAINT "RecurringSeries_revenueStreamId_fkey" FOREIGN KEY ("revenueStreamId") REFERENCES "RevenueStream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueStream" ADD CONSTRAINT "RevenueStream_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bucket" ADD CONSTRAINT "Bucket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bucket" ADD CONSTRAINT "Bucket_revenueStreamId_fkey" FOREIGN KEY ("revenueStreamId") REFERENCES "RevenueStream"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BucketEntry" ADD CONSTRAINT "BucketEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BucketEntry" ADD CONSTRAINT "BucketEntry_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "Bucket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BucketEntry" ADD CONSTRAINT "BucketEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BucketEntry" ADD CONSTRAINT "BucketEntry_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "FixedObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedObligation" ADD CONSTRAINT "FixedObligation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedObligation" ADD CONSTRAINT "FixedObligation_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "Bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalSnapshot" ADD CONSTRAINT "GoalSnapshot_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationTarget" ADD CONSTRAINT "AllocationTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_alertRuleId_fkey" FOREIGN KEY ("alertRuleId") REFERENCES "AlertRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProposal" ADD CONSTRAINT "AiProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProposal" ADD CONSTRAINT "AiProposal_chatMessageId_fkey" FOREIGN KEY ("chatMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "AiProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
