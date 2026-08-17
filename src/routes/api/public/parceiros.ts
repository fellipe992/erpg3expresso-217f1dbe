import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Cache-Control": "no-store",
};

const txt = (max: number) => z.string().trim().max(max).optional().nullable();

const bodySchema = z.object({
  nome: z.string().trim().min(3).max(160),
  documento: txt(40),
  telefone: txt(40),
  whatsapp: txt(40),
  email: z.string().trim().email().max(160).optional().nullable().or(z.literal("")),
  cidade: txt(120),
  estado: txt(60),
  uf: txt(60),
  tipoVeiculo: txt(80),
  modelo: txt(160),
  ano: txt(10),
  placa: txt(20),
  capacidade: txt(20),
  carroceria: txt(80),
  temAntt: txt(10),
  numeroAntt: txt(60),
  regioes: txt(400),
  tiposCarga: txt(400),
  experiencia: txt(2000),
  sobre: txt(2000),
});

const clean = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
};

export const Route = createFileRoute("/api/public/parceiros")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        let parsed: z.infer<typeof bodySchema>;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return new Response(JSON.stringify({ error: "Dados inválidos" }), {
            status: 400,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }

        const ufRaw = clean(parsed.uf) ?? clean(parsed.estado);
        const anoNum = Number(String(parsed.ano ?? "").replace(/\D/g, ""));
        const capNum = Number(
          String(parsed.capacidade ?? "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."),
        );

        const row = {
          nome: parsed.nome.trim(),
          documento: clean(parsed.documento),
          telefone: clean(parsed.telefone),
          whatsapp: clean(parsed.whatsapp),
          email: clean(parsed.email),
          cidade: clean(parsed.cidade),
          uf: ufRaw ? ufRaw.slice(0, 60) : null,
          tipo_veiculo: clean(parsed.tipoVeiculo),
          marca_modelo: clean(parsed.modelo),
          ano: Number.isFinite(anoNum) && anoNum > 1900 && anoNum < 2100 ? anoNum : null,
          placa: clean(parsed.placa)?.toUpperCase().replace(/\s+/g, "") ?? null,
          capacidade_kg: Number.isFinite(capNum) && capNum > 0 ? capNum : null,
          carroceria: clean(parsed.carroceria),
          tem_antt: parsed.temAntt ? /sim|true|1/i.test(parsed.temAntt) : null,
          numero_antt: clean(parsed.numeroAntt),
          regioes: clean(parsed.regioes),
          tipos_carga: clean(parsed.tiposCarga),
          experiencia: clean(parsed.experiencia),
          sobre: clean(parsed.sobre),
          origem: "site",
          payload: JSON.parse(JSON.stringify(parsed)),
        };

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("parceiros_candidaturas").insert(row);
        if (error) {
          return new Response(JSON.stringify({ error: "Falha ao registrar cadastro" }), {
            status: 500,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 201,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      },
    },
  },
});
