import type { AssetClassKey } from "@/lib/finance/portfolio";

export const CLASS_LABEL: Record<AssetClassKey, string> = {
  ACAO: "Ações",
  FII: "FIIs",
  RENDA_FIXA: "Renda fixa",
  FUNDO: "Fundos",
  CRIPTO: "Cripto",
};
