-- Decisão do usuário sobre uma série recorrente (marcar como recorrente ou não). Nula = só a detecção decide.
-- AlterTable
ALTER TABLE "RecurringSeries" ADD COLUMN     "userStatus" "RecurrenceStatus";

