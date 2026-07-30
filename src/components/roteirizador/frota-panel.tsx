import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { FROTA_PADRAO, JORNADA_PADRAO, OPCOES_OTIMIZACAO_PADRAO, custoPorKm } from "@/lib/roteirizacao/frota";
import type {
  CustosVeiculo,
  OpcoesOtimizacao,
  PerfilVeiculo,
  RegrasJornada,
} from "@/lib/roteirizacao/tipos";
import { brl, num } from "@/lib/roteirizacao/format";

const CAMPOS_CUSTO: { key: keyof CustosVeiculo; label: string; sufixo?: string }[] = [
  { key: "consumoKmL", label: "Consumo (km/L)" },
  { key: "precoCombustivel", label: "Combustível (R$/L)" },
  { key: "pedagioPorKm", label: "Pedágio (R$/km)" },
  { key: "salarioDiario", label: "Salário motorista (R$/dia)" },
  { key: "custoHora", label: "Custo por hora (R$)" },
  { key: "manutencaoKm", label: "Manutenção (R$/km)" },
  { key: "depreciacaoKm", label: "Depreciação (R$/km)" },
  { key: "seguroDia", label: "Seguro (R$/dia)" },
  { key: "pneusKm", label: "Pneus (R$/km)" },
  { key: "outrosKm", label: "Outros custos (R$/km)" },
];

export function FrotaPanel({
  frota,
  onChange,
  jornada,
  onJornada,
  opcoes,
  onOpcoes,
}: {
  frota: PerfilVeiculo[];
  onChange: (f: PerfilVeiculo[]) => void;
  jornada: RegrasJornada;
  onJornada: (j: RegrasJornada) => void;
  opcoes: OpcoesOtimizacao;
  onOpcoes: (o: OpcoesOtimizacao) => void;
}) {
  const atualizar = (id: string, patch: Partial<PerfilVeiculo>) =>
    onChange(frota.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  const atualizarCusto = (id: string, key: keyof CustosVeiculo, valor: number) =>
    onChange(
      frota.map((v) => (v.id === id ? { ...v, custos: { ...v.custos, [key]: valor } } : v)),
    );

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Frota e custos operacionais</h3>
            <p className="text-xs text-muted-foreground">
              Configure capacidade, disponibilidade e cada componente de custo por veículo.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onChange(FROTA_PADRAO.map((v) => ({ ...v, custos: { ...v.custos } })))}>
            Restaurar padrão
          </Button>
        </div>

        <Accordion type="multiple" className="w-full">
          {frota.map((v) => (
            <AccordionItem key={v.id} value={v.id}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex flex-1 items-center justify-between pr-3">
                  <span className="font-medium">{v.nome}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{num(v.capacidadeKg)} kg</Badge>
                    <Badge variant="outline">{v.disponiveis} disp.</Badge>
                    <span>{brl(custoPorKm(v))}/km</span>
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-3 pt-1 sm:grid-cols-3 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Capacidade (kg)</Label>
                    <Input
                      inputMode="numeric"
                      value={v.capacidadeKg}
                      onChange={(e) => atualizar(v.id, { capacidadeKg: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Capacidade (m³)</Label>
                    <Input
                      inputMode="decimal"
                      value={v.capacidadeM3}
                      onChange={(e) => atualizar(v.id, { capacidadeM3: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Disponíveis</Label>
                    <Input
                      inputMode="numeric"
                      value={v.disponiveis}
                      onChange={(e) => atualizar(v.id, { disponiveis: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Velocidade média (km/h)</Label>
                    <Input
                      inputMode="numeric"
                      value={v.velocidadeMediaKmh}
                      onChange={(e) =>
                        atualizar(v.id, { velocidadeMediaKmh: Number(e.target.value) || 1 })
                      }
                    />
                  </div>
                  {CAMPOS_CUSTO.map((c) => (
                    <div key={c.key} className="space-y-1">
                      <Label className="text-xs">{c.label}</Label>
                      <Input
                        inputMode="decimal"
                        value={v.custos[c.key]}
                        onChange={(e) => atualizarCusto(v.id, c.key, Number(e.target.value) || 0)}
                      />
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Card>

      <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div>
          <h3 className="font-semibold">Otimização</h3>
          <p className="text-xs text-muted-foreground">
            Define como o sistema escolhe a próxima entrega e trata a capacidade.
          </p>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Modo de otimização</Label>
          <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-1">
            {(
              [
                ["insercao", "Menor inserção"],
                ["setor", "Setor (sweep)"],
              ] as const
            ).map(([valor, rotulo]) => (
              <Button
                key={valor}
                type="button"
                size="sm"
                variant={opcoes.modo === valor ? "default" : "ghost"}
                onClick={() => onOpcoes({ ...opcoes, modo: valor })}
              >
                {rotulo}
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {opcoes.modo === "insercao"
              ? "Cada entrega entra pelo menor aumento de distância, enchendo o veículo até o limite de peso."
              : "Agrupamento por setor angular a partir do CD, depois refino da sequência."}
          </p>
        </div>

        <div className="flex items-start justify-between gap-3 rounded-md border border-border p-2">
          <div>
            <Label className="text-xs">Ignorar cubagem (prioridade ao peso)</Label>
            <p className="text-[11px] text-muted-foreground">
              Desligue para respeitar também a capacidade em m³ de cada veículo.
            </p>
          </div>
          <Switch
            checked={opcoes.ignorarCubagem}
            onCheckedChange={(v) => onOpcoes({ ...opcoes, ignorarCubagem: v })}
            aria-label="Ignorar cubagem"
          />
        </div>

        <div className="flex items-start justify-between gap-3 rounded-md border border-border p-2">
          <div>
            <Label className="text-xs">Consolidar rotas ociosas</Label>
            <p className="text-[11px] text-muted-foreground">
              Pós-otimização que redistribui entregas e reduz veículos com pouca carga.
            </p>
          </div>
          <Switch
            checked={opcoes.consolidarRotas}
            onCheckedChange={(v) => onOpcoes({ ...opcoes, consolidarRotas: v })}
            aria-label="Consolidar rotas ociosas"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Ocupação mínima de peso (%)</Label>
          <Input
            inputMode="numeric"
            value={Math.round(opcoes.ocupacaoMinima * 100)}
            onChange={(e) =>
              onOpcoes({
                ...opcoes,
                ocupacaoMinima: Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100,
              })
            }
          />
          <p className="text-[11px] text-muted-foreground">
            Rotas abaixo desse patamar tentam ser dissolvidas nas rotas próximas.
          </p>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Raio de proximidade (km)</Label>
          <Input
            inputMode="decimal"
            placeholder="Automático"
            value={opcoes.raioProximidadeKm ?? ""}
            onChange={(e) => {
              const bruto = e.target.value.replace(",", ".");
              const n = Number(bruto);
              onOpcoes({
                ...opcoes,
                raioProximidadeKm: bruto === "" || !Number.isFinite(n) || n <= 0 ? null : n,
              });
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Distância máxima para classificar uma entrega como “proximidade” (puxada de outra zona) e
            para realocar entregas entre rotas próximas na consolidação. Vazio = calculado
            automaticamente pela dispersão da malha.
          </p>
        </div>

        <Button variant="ghost" size="sm" onClick={() => onOpcoes({ ...OPCOES_OTIMIZACAO_PADRAO })}>
          Restaurar padrão
        </Button>
      </Card>

      <Card className="space-y-3 p-4">
        <div>
          <h3 className="font-semibold">Controle de jornada</h3>
          <p className="text-xs text-muted-foreground">Limites usados para alertar sobre as rotas.</p>
        </div>
        {(
          [
            ["maxDirecaoContinuaMin", "Tempo máximo de direção contínua (min)"],
            ["intervaloMin", "Intervalo obrigatório (min)"],
            ["almocoMin", "Horário de almoço (min)"],
            ["maxDiarioMin", "Tempo máximo diário (min)"],
            ["toleranciaHoraExtraMin", "Tolerância de horas extras (min)"],
          ] as [keyof RegrasJornada, string][]
        ).map(([key, label]) => (
          <div key={key} className="space-y-1">
            <Label className="text-xs">{label}</Label>
            <Input
              inputMode="numeric"
              value={jornada[key]}
              onChange={(e) => onJornada({ ...jornada, [key]: Number(e.target.value) || 0 })}
            />
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => onJornada({ ...JORNADA_PADRAO })}>
          Restaurar limites legais
        </Button>
      </Card>
      </div>
    </div>
  );
}
