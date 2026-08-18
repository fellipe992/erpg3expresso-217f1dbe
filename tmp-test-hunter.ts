import { createClient } from "@supabase/supabase-js";
import { enviarApresentacaoRegistrando } from "@/lib/hunter-email.server";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: prof } = await sb.from("profiles").select("id, email").ilike("email", "%fellipe%").limit(5);
console.log("profiles:", prof);
const userId = prof?.[0]?.id;
const email = "fellipe@g3expresso.com.br";
let { data: lead } = await sb.from("crm_leads").select("id").eq("email", email).maybeSingle();
if (!lead) {
  const ins = await sb.from("crm_leads").insert({ empresa: "Teste Hunter (envio)", contato_nome: "Fellipe", email, origem: "Prospecção ativa", classificacao: "C", prioridade: "baixa", status: "aberto", etiquetas: ["Hunter","Teste"], created_by: userId }).select("id").single();
  if (ins.error) throw ins.error;
  lead = ins.data;
}
const res = await enviarApresentacaoRegistrando({ supabase: sb as never, userId: userId!, leadId: lead!.id, email, nome: "Fellipe", empresa: "Teste Hunter (envio)" });
console.log("resultado:", res);
const { data: envios } = await sb.from("crm_emails_enviados").select("destinatario,status,detalhe,created_at").order("created_at", { ascending: false }).limit(3);
const { data: ativ } = await sb.from("crm_atividades").select("tipo,titulo,lead_id,created_at").order("created_at", { ascending: false }).limit(3);
console.log("envios:", envios); console.log("atividades:", ativ);
