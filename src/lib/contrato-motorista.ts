import { jsPDF } from "jspdf";
import logoAsset from "@/assets/g3-expresso-logo.png.asset.json";

export const CONTRATO_VERSAO = "v1";

export type DadosContrato = {
  razao_social: string;
  cnpj: string;
  rntrc: string;
  motorista_nome: string;
  motorista_cpf: string | null;
  motorista_cnh: string | null;
  placa: string | null;
  prazo_texto: string;
};

const CONTRATANTE =
  "G3 TRANSPORTES E SERVIÇOS LOGÍSTICOS LTDA, inscrita no CNPJ nº 50.468.812/0001-34, com sede em Cotia/SP, doravante denominada CONTRATANTE";

export function clausulas(d: DadosContrato): { titulo: string; itens: string[] }[] {
  return [
    {
      titulo: "PARTES",
      itens: [
        `CONTRATANTE: ${CONTRATANTE}.`,
        `CONTRATADO: ${d.razao_social}, inscrito no CNPJ/CPF nº ${d.cnpj}, RNTRC nº ${d.rntrc}, neste ato representado por ${d.motorista_nome}${d.motorista_cpf ? `, CPF nº ${d.motorista_cpf}` : ""}${d.motorista_cnh ? `, CNH nº ${d.motorista_cnh}` : ""}${d.placa ? `, operando o veículo de placa ${d.placa}` : ""}, doravante denominado CONTRATADO.`,
      ],
    },
    {
      titulo: "1. OBJETO E NATUREZA JURÍDICA",
      itens: [
        "1.1. O presente contrato tem por objeto a prestação de serviços de transporte rodoviário de cargas, na forma agregada, pelo CONTRATADO à CONTRATANTE.",
        "1.2. As partes declaram que se trata de relação estritamente comercial, sem qualquer vínculo empregatício, subordinação ou exclusividade trabalhista, nos termos da Lei nº 11.442/2007.",
      ],
    },
    {
      titulo: "2. MODALIDADE DE OPERAÇÃO E CIOT",
      itens: [
        "2.1. A operação será realizada na modalidade de Agregação por Período.",
        "2.2. A CONTRATANTE emitirá o CIOT (Código Identificador da Operação de Transporte) por período, em ciclos quinzenais: do dia 01 ao dia 15 e do dia 16 ao último dia de cada mês.",
        "2.3. O CONTRATADO compromete-se a manter o veículo e o registro RNTRC ativos, regulares e vinculados à frota da CONTRATANTE durante toda a vigência deste contrato.",
      ],
    },
    {
      titulo: "3. TABELA DE FRETE",
      itens: [
        "3.1. O CONTRATADO declara que conhece, recebeu e ACEITA a Tabela de Frete da G3 Expresso vigente, que será a única base de remuneração dos serviços prestados.",
        "3.2. Eventuais alterações na tabela serão comunicadas previamente ao CONTRATADO e passarão a valer para as viagens realizadas a partir da data informada.",
      ],
    },
    {
      titulo: "4. CONDIÇÃO DE PAGAMENTO",
      itens: [
        "4.1. As viagens serão apuradas e fechadas por quinzena (01 a 15 e 16 ao fim do mês).",
        `4.2. O pagamento do fechamento será realizado conforme a condição acordada: ${d.prazo_texto}, após a conferência dos serviços e a entrega dos canhotos e comprovantes de entrega.`,
        "4.3. O CONTRATADO declara aceitar esta condição de pagamento, que se aplica a todas as viagens realizadas na vigência do contrato.",
      ],
    },
    {
      titulo: "5. VALE-PEDÁGIO OBRIGATÓRIO",
      itens: [
        "5.1. O Vale-Pedágio será fornecido antecipadamente pela CONTRATANTE por meio de pagamento eletrônico (Tag), conforme as rotas executadas, e não integra o valor do frete, não sendo pago em reembolso ou em espécie (Lei nº 10.209/2001).",
        "5.2. A Tag destina-se exclusivamente às rotas ordenadas pela CONTRATANTE. O uso em fretes de terceiros ou fora das rotas autorizadas será descontado no acerto quinzenal seguinte.",
      ],
    },
    {
      titulo: "6. CUSTOS E RESPONSABILIDADES DO VEÍCULO",
      itens: [
        "6.1. Correm exclusivamente por conta do CONTRATADO todos os custos do veículo, tais como combustível, manutenção, pneus, seguros próprios, impostos, licenciamento e multas de trânsito.",
        "6.2. Abastecimentos, adiantamentos ou despesas custeados pela CONTRATANTE em nome do CONTRATADO serão descontados no fechamento da quinzena correspondente.",
      ],
    },
    {
      titulo: "7. CHECKLIST, PROCESSOS E DESCONTOS",
      itens: [
        "7.1. O CONTRATADO obriga-se a realizar os checklists de saída e de chegada, os apontamentos de viagem, o envio de fotos e comprovantes e o uso do aplicativo da CONTRATANTE, conforme os processos estabelecidos e acordados entre as partes.",
        "7.2. Erros operacionais, avarias, extravios, faltas de mercadoria, falta de apontamento no checklist, canhotos não entregues ou descumprimento dos processos poderão ser descontados do frete líquido no fechamento da quinzena, tendo como comprovação os registros do sistema da CONTRATANTE.",
        "7.3. O CONTRATADO declara concordar previamente com os descontos aplicados nos termos desta cláusula, comprometendo-se a não apresentar recusa, contestação ou reclamação futura sobre eles, sendo-lhe garantido o acesso ao demonstrativo do fechamento antes do pagamento.",
      ],
    },
    {
      titulo: "8. EXCLUSIVIDADE E NÃO CONCORRÊNCIA",
      itens: [
        "8.1. Durante a vigência deste contrato, o CONTRATADO não poderá prestar serviços para outras transportadoras nem negociar ou prestar serviços diretamente aos clientes da CONTRATANTE, salvo autorização prévia e por escrito da CONTRATANTE.",
        "8.2. Pelo prazo de 1 (um) ano após o encerramento deste contrato, o CONTRATADO não poderá prestar serviços, direta ou indiretamente (inclusive por terceiros, parentes ou outra empresa), aos clientes da CONTRATANTE para os quais tenha operado.",
      ],
    },
    {
      titulo: "9. MULTA",
      itens: [
        "9.1. O descumprimento da cláusula 8 sujeitará o CONTRATADO ao pagamento de multa compensatória equivalente à soma dos fretes recebidos da CONTRATANTE nos 12 (doze) meses anteriores à infração, sem prejuízo da apuração de perdas e danos.",
      ],
    },
    {
      titulo: "10. AUSÊNCIA DE VÍNCULO COM O CLIENTE FINAL",
      itens: [
        "10.1. O CONTRATADO reconhece que não possui qualquer vínculo comercial com os clientes da CONTRATANTE, sendo esta a única responsável pela negociação e intermediação comercial.",
      ],
    },
    {
      titulo: "11. SIGILO E DADOS",
      itens: [
        "11.1. O CONTRATADO manterá sigilo sobre clientes, preços, tabelas, rotas e demais informações da CONTRATANTE, durante e após o contrato.",
        "11.2. O CONTRATADO autoriza a coleta de sua localização (GPS) durante as viagens, para fins de monitoramento e segurança da carga, conforme a Lei nº 13.709/2018 (LGPD).",
      ],
    },
    {
      titulo: "12. VIGÊNCIA E RESCISÃO",
      itens: [
        "12.1. Este contrato vigora por prazo indeterminado a partir da data da assinatura.",
        "12.2. Poderá ser rescindido por qualquer das partes mediante aviso prévio de 15 (quinze) dias, com o acerto das viagens já realizadas no fechamento seguinte.",
      ],
    },
    {
      titulo: "13. ASSINATURA ELETRÔNICA E FORO",
      itens: [
        "13.1. As partes reconhecem a validade da assinatura eletrônica realizada na tela do aplicativo, registrada com data, hora e dispositivo, nos termos da MP nº 2.200-2/2001 e da Lei nº 14.063/2020.",
        "13.2. Fica eleito o foro da Comarca de Cotia/SP para dirimir quaisquer questões deste contrato.",
      ],
    },
  ];
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((r) => {
      const fr = new FileReader();
      fr.onload = () => r(fr.result as string);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function gerarPdfContrato(d: DadosContrato, assinaturaPng: string, assinadoEm: Date): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 18, L = W - M * 2;
  let y = 16;
  const logo = await toDataUrl((logoAsset as { url: string }).url);
  if (logo) {
    try { doc.addImage(logo, "PNG", M, y, 36, 14); } catch { /* ignora */ }
  }
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text("CONTRATO DE PRESTAÇÃO DE SERVIÇOS", W / 2 + 12, y + 5, { align: "center" });
  doc.text("DE TRANSPORTE DE CARGAS", W / 2 + 12, y + 11, { align: "center" });
  y += 24;
  const nova = (h: number) => { if (y + h > 282) { doc.addPage(); y = 18; } };
  for (const c of clausulas(d)) {
    nova(10);
    doc.setFont("helvetica", "bold").setFontSize(10);
    doc.text(c.titulo, M, y); y += 5;
    doc.setFont("helvetica", "normal").setFontSize(9.5);
    for (const t of c.itens) {
      const linhas = doc.splitTextToSize(t, L);
      nova(linhas.length * 4.4);
      doc.text(linhas, M, y, { align: "justify", maxWidth: L });
      y += linhas.length * 4.4 + 1.5;
    }
    y += 2;
  }
  nova(70);
  y += 4;
  doc.setFontSize(9.5).text(`Cotia/SP, ${assinadoEm.toLocaleDateString("pt-BR")}.`, M, y);
  y += 8;
  doc.addImage(assinaturaPng, "PNG", M, y, 70, 28);
  y += 30;
  doc.line(M, y, M + 80, y);
  doc.setFont("helvetica", "bold").text(d.razao_social, M, y + 5);
  doc.setFont("helvetica", "normal").text(`CONTRATADO — ${d.motorista_nome}`, M, y + 10);
  doc.line(W - M - 80, y, W - M, y);
  doc.setFont("helvetica", "bold").text("G3 TRANSPORTES E SERVIÇOS LOGÍSTICOS LTDA", W - M - 80, y + 5);
  doc.setFont("helvetica", "normal").text("CONTRATANTE", W - M - 80, y + 10);
  doc.setFontSize(7.5).setTextColor(110);
  doc.text(
    `Assinado eletronicamente em ${assinadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (horário de Brasília) · Versão ${CONTRATO_VERSAO} · Dispositivo: ${navigator.userAgent.slice(0, 110)}`,
    M, y + 18, { maxWidth: L },
  );
  return doc.output("blob");
}
