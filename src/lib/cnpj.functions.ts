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

    let naoEncontrado = false;
    const falhas: string[] = [];

    // 1) BrasilAPI (Receita Federal)
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        headers: { accept: "application/json" },
      });
      if (res.status === 404) naoEncontrado = true;
      else if (res.ok) {
        const j = (await res.json()) as Record<string, unknown>;
        return {
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
        };
      } else falhas.push(`brasilapi ${res.status}`);
    } catch (e) {
      falhas.push(`brasilapi ${(e as Error).message}`);
    }

    // 2) Fallback: CNPJá aberto
    try {
      const res = await fetch(`https://open.cnpja.com/office/${cnpj}`, {
        headers: { accept: "application/json" },
      });
      if (res.status === 404) naoEncontrado = true;
      else if (res.ok) {
        const j = (await res.json()) as Record<string, any>;
        const addr = j["address"] ?? {};
        const fone = (j["phones"] ?? [])[0];
        const mail = (j["emails"] ?? [])[0];
        return {
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
        };
      } else falhas.push(`cnpja ${res.status}`);
    } catch (e) {
      falhas.push(`cnpja ${(e as Error).message}`);
    }

    if (naoEncontrado) throw new Error("CNPJ não encontrado na Receita Federal");
    console.error("[consultarCnpj] falhas:", falhas.join(" | "));
    throw new Error("Consulta de CNPJ indisponível no momento. Tente novamente em instantes.");
  });
