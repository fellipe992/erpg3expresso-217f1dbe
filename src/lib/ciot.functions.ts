import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EntradaCiot } from "@/lib/ciot-tipos";

const dig = (v: unknown) => String(v ?? "").replace(/\D+/g, "");
const txt = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown) => Number(v ?? 0) || 0;

/** Quais caminhos de geração de CIOT estão disponíveis neste ambiente. */
export const statusCiot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getCredenciaisCiot, credenciaisCiotGestora } = await import("@/lib/fiscal.server");
    return {
      bsoft: (await getCredenciaisCiot(context.supabase)).configurado,
      gestora: credenciaisCiotGestora().configurado,
    };
  });

/**
 * Gera (ou registra) o CIOT.
 * - provedor "manual": grava o número informado, já como emitido;
 * - provedor "bsoft"/"gestora": envia a operação e guarda número e protocolo devolvidos.
 */
export const gerarCiot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: EntradaCiot) => {
    if (!data) throw new Error("Dados do CIOT não informados.");
    if (!txt(data.contratadoNome)) throw new Error("Informe o nome do transportador contratado.");
    if (!dig(data.contratadoDocumento)) throw new Error("Informe o CPF/CNPJ do transportador contratado.");
    if (!(num(data.valorFrete) > 0)) throw new Error("Informe o valor do frete contratado.");
    if (data.provedor === "manual" && !txt(data.numeroCiot)) {
      throw new Error("Informe o número do CIOT gerado no portal da gestora.");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const base = {
      provedor: data.provedor,
      tipo_contratado: data.tipoContratado,
      contratado_nome: txt(data.contratadoNome, 120),
      contratado_documento: dig(data.contratadoDocumento),
      contratado_rntrc: dig(data.contratadoRntrc).slice(0, 8) || null,
      valor_frete: num(data.valorFrete),
      valor_adiantamento: num(data.valorAdiantamento),
      valor_quitacao: num(data.valorQuitacao),
      distancia_km: num(data.distanciaKm) || null,
      data_emissao: txt(data.dataEmissao, 10) || new Date().toISOString().slice(0, 10),
      viagem_id: data.viagemId ?? null,
      cliente_id: data.clienteId ?? null,
      motorista_id: data.motoristaId ?? null,
      veiculo_id: data.veiculoId ?? null,
      observacoes: txt(data.observacoes, 500) || null,
      created_by: context.userId,
    };

    if (data.provedor === "manual") {
      const { data: row, error } = await context.supabase
        .from("fiscal_ciots")
        .insert({ ...base, status: "emitido", numero_ciot: txt(data.numeroCiot, 40) })
        .select("id")
        .single();
      if (error || !row) throw new Error(error?.message ?? "Não foi possível registrar o CIOT.");
      return { id: row.id as string, numero: txt(data.numeroCiot, 40) };
    }

    const { data: row, error } = await context.supabase
      .from("fiscal_ciots")
      .insert({ ...base, status: "processando" })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Não foi possível registrar o CIOT.");

    const payload = {
      idIntegracao: row.id,
      tipoContratado: data.tipoContratado,
      contratado: {
        nome: base.contratado_nome,
        inscricaoFederal: base.contratado_documento,
        rntrc: base.contratado_rntrc ?? undefined,
      },
      viagem: {
        distanciaKm: base.distancia_km ?? undefined,
        dataEmissao: base.data_emissao,
      },
      pagamento: {
        valorFrete: base.valor_frete,
        valorAdiantamento: base.valor_adiantamento,
        valorQuitacao: base.valor_quitacao,
      },
      observacao: base.observacoes ?? undefined,
    };

    try {
      const { ciotBsoft, ciotGestora } = await import("@/lib/ciot.server");
      const resposta = (data.provedor === "bsoft"
        ? await ciotBsoft<Record<string, unknown>>({ path: "/v1/integracoes/ciot", method: "POST", body: payload })
        : await ciotGestora<Record<string, unknown>>({ path: "/ciots", method: "POST", body: payload })) ?? {};

      const numero =
        txt(resposta["ciot"] ?? resposta["numeroCiot"] ?? resposta["numero"] ?? resposta["codigo"], 40) || null;
      const protocolo = txt(resposta["protocolo"] ?? resposta["idTransacao"] ?? resposta["id"], 60) || null;

      await context.supabase
        .from("fiscal_ciots")
        .update({
          numero_ciot: numero,
          protocolo,
          status: numero ? "emitido" : "processando",
          motivo: null,
          payload: JSON.parse(JSON.stringify(payload)),
          resultado: JSON.parse(JSON.stringify(resposta)),
        })
        .eq("id", row.id);

      return { id: row.id as string, numero };
    } catch (e) {
      const motivo = e instanceof Error ? e.message : "Falha desconhecida";
      await context.supabase
        .from("fiscal_ciots")
        .update({ status: "rejeitado", motivo: motivo.slice(0, 2000), payload: JSON.parse(JSON.stringify(payload)) })
        .eq("id", row.id);
      throw e;
    }
  });

/** Lança/corrige o número do CIOT obtido fora do sistema. */
export const registrarNumeroCiot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; numero: string }) => {
    if (!data?.id) throw new Error("CIOT não informado.");
    if (!txt(data.numero)) throw new Error("Informe o número do CIOT.");
    return { id: String(data.id), numero: txt(data.numero, 40) };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("fiscal_ciots")
      .update({ numero_ciot: data.numero, status: "emitido", motivo: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Cancela o CIOT no provedor (quando automático) e marca o registro. */
export const cancelarCiot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; motivo: string }) => {
    if (!data?.id) throw new Error("CIOT não informado.");
    const motivo = txt(data.motivo, 255);
    if (motivo.length < 5) throw new Error("Informe o motivo do cancelamento.");
    return { id: String(data.id), motivo };
  })
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("fiscal_ciots")
      .select("id, provedor, numero_ciot, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("CIOT não encontrado.");
    if (row.status === "cancelado") throw new Error("Este CIOT já está cancelado.");

    if (row.provedor !== "manual" && row.numero_ciot) {
      const { ciotBsoft, ciotGestora } = await import("@/lib/ciot.server");
      const body = { ciot: row.numero_ciot, motivo: data.motivo };
      if (row.provedor === "bsoft") {
        await ciotBsoft(context.supabase, { path: "/v1/integracoes/ciot/cancelar", method: "POST", body });
      } else {
        await ciotGestora({ path: `/ciots/${encodeURIComponent(row.numero_ciot)}/cancelar`, method: "POST", body });
      }
    }

    await context.supabase
      .from("fiscal_ciots")
      .update({ status: "cancelado", motivo: data.motivo })
      .eq("id", row.id);
    return { ok: true };
  });

/** Encerra o CIOT após a entrega da carga. */
export const encerrarCiot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("CIOT não informado.");
    return { id: String(data.id) };
  })
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("fiscal_ciots")
      .select("id, provedor, numero_ciot, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("CIOT não encontrado.");
    if (!row.numero_ciot) throw new Error("Informe o número do CIOT antes de encerrar.");

    if (row.provedor !== "manual") {
      const { ciotBsoft, ciotGestora } = await import("@/lib/ciot.server");
      const body = { ciot: row.numero_ciot };
      if (row.provedor === "bsoft") {
        await ciotBsoft(context.supabase, { path: "/v1/integracoes/ciot/encerrar", method: "POST", body });
      } else {
        await ciotGestora({ path: `/ciots/${encodeURIComponent(row.numero_ciot)}/encerrar`, method: "POST", body });
      }
    }

    await context.supabase.from("fiscal_ciots").update({ status: "encerrado" }).eq("id", row.id);
    return { ok: true };
  });
