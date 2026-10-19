import { unzipSync } from "fflate";

/**
 * Importação dos dados oficiais de risco (servidor).
 * - PRF: acidentes em rodovias federais ("agrupados por ocorrência"), por ano.
 *   Agregados em áreas de ~2 km. Pontos: acidente 1, com feridos 2, com mortos 5.
 * - O cálculo dos níveis fica no banco (recalcular_zonas_oficiais).
 */

const PAGINA_PRF = "https://www.gov.br/prf/pt-br/acesso-a-informacao/dados-abertos/dados-abertos-da-prf";

/** IDs conhecidos dos arquivos anuais da PRF (fallback se a página mudar). */
const PRF_ARQUIVOS: Record<number, string> = {
  2023: "1-WO3SfNrwwZ5_l7fRTiwBKRw7mi1-HUq",
  2024: "14lB0vqMFkaZj8HZ44b0njYgxs9nAN8KO",
  2025: "1-G3MdmHBt6CprDwcW99xxC4BZ2DU5ryR",
  2026: "1A3IirNm0AzRaSosA1IS94DOVmvKsn0Ol",
};

export const CELULA_GRAUS = 0.02;

/** Peso de um acidente pela gravidade. */
export function pontosAcidente(feridos: number, mortos: number) {
  if (mortos > 0) return 5;
  if (feridos > 0) return 2;
  return 1;
}

async function idArquivoPrf(ano: number): Promise<string | null> {
  try {
    const html = await (await fetch(PAGINA_PRF, { headers: { "User-Agent": "Mozilla/5.0" } })).text();
    const re = new RegExp(
      `Acidentes ${ano} \\(Agrupados por ocorr[^)]*\\)[\\s\\S]{0,400}?drive\\.google\\.com/file/d/([\\w-]+)`,
    );
    const m = html.match(re);
    if (m) return m[1];
  } catch {
    /* usa o fallback */
  }
  return PRF_ARQUIVOS[ano] ?? null;
}

function latin1(bytes: Uint8Array, ini: number, fim: number) {
  let s = "";
  for (let i = ini; i < fim; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

type Celula = {
  chave: string; lat: number; lng: number; uf: string; br: string; km: string; municipio: string;
  acidentes: number; com_feridos: number; com_mortos: number; pontos: number;
};

/** Baixa e agrega um ano da PRF. */
export async function agregarPrfAno(ano: number): Promise<Celula[]> {
  const id = await idArquivoPrf(ano);
  if (!id) throw new Error(`Arquivo da PRF de ${ano} não encontrado.`);
  const res = await fetch(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`);
  if (!res.ok) throw new Error(`PRF ${ano}: download falhou (${res.status}).`);
  const zip = new Uint8Array(await res.arrayBuffer());
  const arquivos = unzipSync(zip, { filter: (f) => f.name.toLowerCase().endsWith(".csv") });
  const bytes = Object.values(arquivos)[0];
  if (!bytes) throw new Error(`PRF ${ano}: arquivo sem planilha.`);

  const celulas = new Map<string, Celula & { sLat: number; sLng: number }>();
  let col: Record<string, number> | null = null;
  let ini = 0;
  for (let i = 0; i <= bytes.length; i++) {
    if (i < bytes.length && bytes[i] !== 10) continue;
    const linha = latin1(bytes, ini, i).replace(/\r$/, "");
    ini = i + 1;
    if (!linha) continue;
    const c = linha.split(";").map((v) => v.replace(/^"|"$/g, ""));
    if (!col) {
      col = Object.fromEntries(c.map((n, k) => [n.trim(), k]));
      for (const n of ["uf", "br", "km", "municipio", "mortos", "feridos", "latitude", "longitude"])
        if (col[n] === undefined) throw new Error(`PRF ${ano}: formato mudou (coluna ${n} ausente).`);
      continue;
    }
    const lat = Number(c[col.latitude]?.replace(",", "."));
    const lng = Number(c[col.longitude]?.replace(",", "."));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat > 6 || lat < -34 || lng > -34 || lng < -74) continue;
    const chave = `${Math.round(lat / CELULA_GRAUS)}_${Math.round(lng / CELULA_GRAUS)}`;
    const feridos = Number(c[col.feridos]) || 0;
    const mortos = Number(c[col.mortos]) || 0;
    let cel = celulas.get(chave);
    if (!cel) {
      cel = {
        chave, lat: 0, lng: 0, sLat: 0, sLng: 0, uf: c[col.uf], br: c[col.br], km: c[col.km]?.split(",")[0],
        municipio: c[col.municipio], acidentes: 0, com_feridos: 0, com_mortos: 0, pontos: 0,
      };
      celulas.set(chave, cel);
    }
    cel.acidentes++;
    cel.sLat += lat;
    cel.sLng += lng;
    if (feridos > 0) cel.com_feridos++;
    if (mortos > 0) cel.com_mortos++;
    cel.pontos += pontosAcidente(feridos, mortos);
  }
  return [...celulas.values()].map(({ sLat, sLng, ...c }) => ({
    ...c,
    lat: sLat / c.acidentes,
    lng: sLng / c.acidentes,
  }));
}

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Importa um ano da PRF (substitui só as linhas desse ano) e recalcula os níveis. */
export async function atualizarZonasOficiais(admin: Admin, anos: number[]) {
  const resultado: Record<string, unknown> = {};
  for (const ano of anos) {
    try {
      const cels = await agregarPrfAno(ano);
      if (cels.length < 100) throw new Error(`PRF ${ano}: poucos registros (${cels.length}); mantidos os dados anteriores.`);
      const { error: delErr } = await admin.from("zonas_oficiais_prf_celulas").delete().eq("ano", ano);
      if (delErr) throw delErr;
      for (let i = 0; i < cels.length; i += 1000) {
        const { error } = await admin
          .from("zonas_oficiais_prf_celulas")
          .insert(cels.slice(i, i + 1000).map((c) => ({ ...c, ano })));
        if (error) throw error;
      }
      await admin.from("zonas_risco_importacoes").insert({ fonte: "prf", referencia: String(ano), linhas: cels.length });
      resultado[`prf_${ano}`] = cels.length;
    } catch (e) {
      const msg = (e as Error).message;
      console.error("[zonas-oficiais]", msg);
      await admin.from("zonas_risco_importacoes").insert({ fonte: "prf", referencia: String(ano), status: "erro", erro: msg });
      resultado[`prf_${ano}`] = `erro: ${msg}`;
    }
  }
  const { data, error } = await admin.rpc("recalcular_zonas_oficiais");
  if (error) {
    await admin.from("zonas_risco_importacoes").insert({ fonte: "recalculo", status: "erro", erro: error.message });
    throw error;
  }
  await admin.from("zonas_risco_importacoes").insert({ fonte: "recalculo", referencia: JSON.stringify(data) });
  return { ...resultado, zonas: data };
}

/** Ano atual no fuso de São Paulo. */
export function anoAtualSP() {
  return Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", year: "numeric" }));
}
