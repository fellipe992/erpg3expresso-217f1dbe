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
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${data.cnpj}`, {
      headers: { accept: "application/json" },
    });
    if (res.status === 404) throw new Error("CNPJ não encontrado na Receita Federal");
    if (!res.ok) throw new Error("Não foi possível consultar o CNPJ agora. Tente novamente.");
    const j = (await res.json()) as Record<string, unknown>;

    const logradouro = String(j["logradouro"] ?? "").trim();
    const numero = String(j["numero"] ?? "").trim();
    const complemento = String(j["complemento"] ?? "").trim();
    const bairro = String(j["bairro"] ?? "").trim();
    const endereco = [
      [logradouro, numero].filter(Boolean).join(", "),
      complemento,
      bairro,
    ]
      .filter(Boolean)
      .join(" - ");

    const ddd = String(j["ddd_telefone_1"] ?? "").trim();

    return {
      cnpj: data.cnpj,
      razao_social: String(j["razao_social"] ?? "").trim(),
      nome_fantasia: String(j["nome_fantasia"] ?? "").trim() || null,
      telefone: ddd || null,
      email: String(j["email"] ?? "").trim().toLowerCase() || null,
      endereco: endereco || null,
      cidade: String(j["municipio"] ?? "").trim() || null,
      uf: String(j["uf"] ?? "").trim().toUpperCase() || null,
      cep: so(j["cep"]) || null,
      situacao: String(j["descricao_situacao_cadastral"] ?? "").trim() || null,
    };
  });
