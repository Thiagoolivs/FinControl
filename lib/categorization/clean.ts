// Limpeza da descrição antes de tudo: o original fica em descriptionRaw.

// Intermediadores de pagamento que aparecem antes do nome da loja ("PAG*IFOOD", "PAYPAL *SPOTIFY").
// Só os genéricos: prefixos que identificam o tipo de gasto (UBER *, IFD*) ficam.
const ACQUIRER_PREFIX =
  /^(?:PAG|PG|PAGSEGURO|PAGBANK|MP|MERCADOPAGO|MERCPAGO|PICPAY|IZ|SUMUP|EBANX|EBN|PAYPAL|STONE|CIELO|GETNET|SQ|PP)\s*\*\s*/i;
// Operação do banco antes do nome da loja ("Compra no débito - Padaria X"). Pix e boleto ficam: dizem o que é.
const CARD_PURCHASE_PREFIX =
  /^(?:compra|pagamento|pgto)(?:\s+(?:no|na|com|de|em))?\s+(?:cart[aã]o\s+(?:de\s+)?)?(?:d[eé]bito|cr[eé]dito)(?:\s+via\s+\S+)?\s*[-–:]\s*/i;
const INSTALLMENT = /\(?\bPARC(?:ELA)?\.?\s*\d{1,2}\s*(?:\/|DE)\s*\d{1,2}\b\)?|\(?\b\d{1,2}\/\d{1,2}\b\)?/gi;
// Autorização, NSU, horário, datas longas: tokens que começam com dígito e têm 4+ caracteres.
const NUMERIC_TOKEN = /(?<=^|\s)\d[\d.\-/:]{3,}(?=\s|$)/g;
const COUNTRY_SUFFIX = /\s+(?:BR|BRA)$/i;
const EDGE_PUNCTUATION = /^[\s*\-/.,]+|[\s*\-/.,]+$/g;

/** "PAG*IFOOD 4421" → "IFOOD"; "MAGALU PARC 03/10" → "MAGALU"; "NETFLIX.COM SAO PAULO BR" → "NETFLIX.COM SAO PAULO". */
export function cleanDescription(raw: string): string {
  const original = raw.trim().replace(/\s+/g, " ");
  let text = original.replace(CARD_PURCHASE_PREFIX, "");
  for (let previous = ""; previous !== text; ) {
    previous = text;
    text = text.replace(ACQUIRER_PREFIX, "");
  }
  text = text.replace(INSTALLMENT, " ").replace(NUMERIC_TOKEN, " ").replace(/\s+/g, " ").trim();
  text = text.replace(COUNTRY_SUFFIX, "").replace(EDGE_PUNCTUATION, "").trim();
  return text || original;
}
