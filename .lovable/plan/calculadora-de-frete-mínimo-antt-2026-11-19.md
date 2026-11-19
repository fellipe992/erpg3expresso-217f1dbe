# Calculadora de Frete Mínimo (ANTT)

Nova tela **Operacional → Calculadora de Frete**, que calcula o piso mínimo da ANTT para uma viagem e diz se o frete combinado está acima ou abaixo dele, antes de emitir qualquer documento.

## O que a tela terá

**1. Perguntas do cálculo** (as mesmas que a ANTT exige):
- O transporte é de **carga lotação** (o veículo leva uma carga só, de um contratante)? Se for fracionada ou entrega urbana de várias notas, a tela avisa que o piso não se aplica.
- **Categoria do veículo**: puxa os seus veículos (Fiorino, Van, VUC, Utilitário, Cavalo, Outro) e cada uma é ligada ao **número de eixos** da ANTT (2, 3, 4, 5, 6, 7 ou 9 eixos). Dá para escolher um veículo da frota ou só a categoria.
- **Tipo de carga** (os 12 tipos da ANTT): carga geral, granel sólido, granel líquido, frigorificada, conteinerizada, neogranel, granel pressurizada e as versões de carga perigosa.
- **Tabela**: com o conjunto completo (veículo + implemento) ou só o veículo automotor. E se é **alto desempenho** (o veículo volta carregado ou a operação tem alta produtividade).
- **Distância em km** (digitada, ou calculada por origem e destino com o mapa que o sistema já usa).
- **Retorno vazio?** Se sim, a ANTT soma o trecho de volta.
- **Frete combinado (R$)**, opcional, para comparar.

**2. Resultado**
- O piso mínimo detalhado: custo por km × distância + custo de carga e descarga, mais o retorno vazio se houver.
- Selo **"Dentro do piso"** ou **"Abaixo do piso"**, com quanto falta.
- Aviso de que pedágio e impostos não entram no piso e são cobrados à parte.

**3. Guia rápido** (no mesmo lugar)
- **Onde se aplica:** transporte rodoviário remunerado de carga lotação, por empresa (ETC), cooperativa (CTC) ou autônomo (TAC).
- **Onde não se aplica:** carga fracionada, transporte com veículo próprio da empresa dona da carga, mudanças, entregas urbanas de várias notas.
- **Informações básicas:** categoria/eixos, tipo de carga, distância, retorno vazio, tabela A/B/C/D.
- Multa e responsabilidade de quem contrata abaixo do piso.

**4. Simulações salvas** (opcional)
- Botão "Salvar simulação" com nome/cliente, para comparar viagens depois. Nada vira documento nem mexe no financeiro.

## Valores da ANTT
Os coeficientes (custo por km e custo de carga/descarga, para cada tipo de carga × eixos × tabela) ficam numa tabela do sistema com a **data de vigência** da resolução. Quando a ANTT reajustar (ela atualiza quando o diesel varia mais de 5%), entra uma nova versão sem apagar a antiga, então os cálculos já feitos continuam valendo pela tabela da data deles. Antes de lançar, confiro os valores atuais no site oficial da ANTT.

## Detalhes técnicos
- Rota `src/routes/_authenticated/app/calculadora-frete.tsx` + item no menu Operacional (`app-sidebar.tsx`).
- `src/lib/frete-antt.ts`: função pura `calcularPisoAntt({tabela, tipoCarga, eixos, km, retornoVazio})` → `{ccd, cc, piso, detalhes}`; `mapearEixos(tipoVeiculo)` (fiorino/van/vuc/utilitário = 2 eixos; cavalo pergunta os eixos do conjunto).
- Migração: `antt_coeficientes` (vigencia_inicio, resolucao, tabela, tipo_carga, eixos, ccd, cc) com carga inicial da resolução vigente; `frete_simulacoes` (opcional); RLS só staff.
- Testes em `frete-antt.test.ts`: piso = CCD×km + CC; o retorno vazio soma o trecho de volta; fracionada retorna "não se aplica".
