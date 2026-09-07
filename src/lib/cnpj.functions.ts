import { createServerFn } from "@tanstack/react-start";

export type CnpjDados = {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  situacao: string | null;
};

const so = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** Cache em memória (24h) para não estourar o limite das APIs públicas. */
const cache = new Map<string, { dados: CnpjDados; ts: number }>();
const TTL = 24 * 60 * 60 * 1000;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Busca com uma nova tentativa quando o serviço responde 429 (limite de uso). */
async function buscar(url: string) {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (res.status !== 429 || tentativa === 1) return res;
    await espera(900);
  }
  throw new Error("indisponível");
}


/** Consulta dados públicos de um CNPJ na BrasilAPI (Receita Federal). */
export const consultarCnpj = createServerFn({ method: "GET" })
  .inputValidator((data: { cnpj: string }) => {
    const cnpj = so(data?.cnpj);
    if (cnpj.length !== 14) throw new Error("CNPJ deve ter 14 dígitos");
    return { cnpj };
  })
  .handler(async ({ data }): Promise<CnpjDados> => {
    const cnpj = data.cnpj;
    const txt = (v: unknown) => String(v ?? "").trim();
    const monta = (
      logradouro: string,
      numero: string,
      complemento: string,
      bairro: string,
    ) =>
      [[logradouro, numero].filter(Boolean).join(", "), complemento, bairro]
        .filter(Boolean)
        .join(" - ") || null;

    const guardar = (d: CnpjDados) => {
      cache.set(cnpj, { dados: d, ts: Date.now() });
      return d;
    };

    const emCache = cache.get(cnpj);
    if (emCache && Date.now() - emCache.ts < TTL) return emCache.dados;

    let naoEncontrado = false;
    const falhas: string[] = [];

    // 1) BrasilAPI (Receita Federal)
    try {
      const res = await buscar(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (res.status === 404) naoEncontrado = true;
      else if (res.ok) {
        const j = (await res.json()) as Record<string, unknown>;
        return guardar({
          cnpj,
          razao_social: txt(j["razao_social"]),
          nome_fantasia: txt(j["nome_fantasia"]) || null,
          telefone: txt(j["ddd_telefone_1"]) || null,
          email: txt(j["email"]).toLowerCase() || null,
          endereco: monta(txt(j["logradouro"]), txt(j["numero"]), txt(j["complemento"]), txt(j["bairro"])),
          cidade: txt(j["municipio"]) || null,
          uf: txt(j["uf"]).toUpperCase() || null,
          cep: so(j["cep"]) || null,
          situacao: txt(j["descricao_situacao_cadastral"]) || null,
        });
      } else falhas.push(`brasilapi ${res.status}`);
    } catch (e) {
      falhas.push(`brasilapi ${(e as Error).message}`);
    }

    // 2) Fallback: CNPJá aberto
    try {
      const res = await buscar(`https://open.cnpja.com/office/${cnpj}`);
      if (res.status === 404) naoEncontrado = true;
      else if (res.ok) {
        const j = (await res.json()) as Record<string, any>;
        const addr = j["address"] ?? {};
        const fone = (j["phones"] ?? [])[0];
        const mail = (j["emails"] ?? [])[0];
        return guardar({
          cnpj,
          razao_social: txt(j["company"]?.["name"]),
          nome_fantasia: txt(j["alias"]) || null,
          telefone: fone ? `(${txt(fone["area"])}) ${txt(fone["number"])}` : null,
          email: txt(mail?.["address"]).toLowerCase() || null,
          endereco: monta(txt(addr["street"]), txt(addr["number"]), txt(addr["details"]), txt(addr["district"])),
          cidade: txt(addr["city"]) || null,
          uf: txt(addr["state"]).toUpperCase() || null,
          cep: so(addr["zip"]) || null,
          situacao: txt(j["status"]?.["text"]) || null,
        });
      } else falhas.push(`cnpja ${res.status}`);
    } catch (e) {
      falhas.push(`cnpja ${(e as Error).message}`);
    }

    // 3) Fallback: ReceitaWS
    try {
      const res = await buscar(`https://receitaws.com.br/v1/cnpj/${cnpj}`);
      if (res.ok) {
        const j = (await res.json()) as Record<string, any>;
        if (String(j["status"] ?? "").toUpperCase() === "ERROR") naoEncontrado = true;
        else
          return guardar({
            cnpj,
            razao_social: txt(j["nome"]),
            nome_fantasia: txt(j["fantasia"]) || null,
            telefone: txt(j["telefone"]).split("/")[0]?.trim() || null,
            email: txt(j["email"]).toLowerCase() || null,
            endereco: monta(txt(j["logradouro"]), txt(j["numero"]), txt(j["complemento"]), txt(j["bairro"])),
            cidade: txt(j["municipio"]) || null,
            uf: txt(j["uf"]).toUpperCase() || null,
            cep: so(j["cep"]) || null,
            situacao: txt(j["situacao"]) || null,
          });
      } else falhas.push(`receitaws ${res.status}`);
    } catch (e) {
      falhas.push(`receitaws ${(e as Error).message}`);
    }

    if (naoEncontrado) throw new Error("CNPJ não encontrado na Receita Federal");
    console.error("[consultarCnpj] falhas:", falhas.join(" | "));
    throw new Error(
      "Consulta de CNPJ temporariamente limitada pelos serviços públicos. Aguarde alguns segundos e tente novamente, ou preencha os dados manualmente.",
    );
  });

