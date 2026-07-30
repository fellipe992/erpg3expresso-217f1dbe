import { supabase } from "@/integrations/supabase/client";

export type Geocodificado = {
  endereco: string;
  enderecoFormatado?: string;
  lat?: number;
  lng?: number;
  regiao?: string | null;
  erro?: string;
};

/** Geocodifica endereços em lote pela rota protegida do servidor. */
export async function geocodificar(enderecos: string[]): Promise<Geocodificado[]> {
  if (!enderecos.length) return [];
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada");

  const resultados: Geocodificado[] = [];
  for (let i = 0; i < enderecos.length; i += 200) {
    const lote = enderecos.slice(i, i + 200);
    const res = await fetch("/api/roteirizador-geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ enderecos: lote }),
    });
    if (!res.ok) throw new Error(await res.text());
    const json = (await res.json()) as { resultados: Geocodificado[] };
    resultados.push(...json.resultados);
  }
  return resultados;
}
