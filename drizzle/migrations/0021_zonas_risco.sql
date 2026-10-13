CREATE TABLE public.zonas_risco (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'roubo',
  nivel smallint NOT NULL DEFAULT 2 CHECK (nivel BETWEEN 1 AND 4),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  raio_m integer NOT NULL DEFAULT 3000,
  uf text,
  horario_critico text,
  recomendacao text,
  origem text NOT NULL DEFAULT 'base_g3',
  ativo boolean NOT NULL DEFAULT true,
  validado_por uuid,
  validado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zonas_risco TO authenticated;
GRANT ALL ON public.zonas_risco TO service_role;
ALTER TABLE public.zonas_risco ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zonas leitura" ON public.zonas_risco FOR SELECT TO authenticated USING (true);
CREATE POLICY "zonas escrita operacao" ON public.zonas_risco FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'administrador') OR private.has_role(auth.uid(),'gestor') OR private.has_role(auth.uid(),'monitor'))
  WITH CHECK (private.has_role(auth.uid(),'administrador') OR private.has_role(auth.uid(),'gestor') OR private.has_role(auth.uid(),'monitor'));

CREATE TABLE public.zonas_risco_reportes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  lat double precision,
  lng double precision,
  bairro text,
  tipo text NOT NULL DEFAULT 'roubo',
  nivel_sugerido smallint NOT NULL DEFAULT 3 CHECK (nivel_sugerido BETWEEN 1 AND 4),
  comentario text,
  status text NOT NULL DEFAULT 'pendente',
  zona_id uuid REFERENCES public.zonas_risco(id) ON DELETE SET NULL,
  revisado_por uuid,
  revisado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.zonas_risco_reportes TO authenticated;
GRANT ALL ON public.zonas_risco_reportes TO service_role;
ALTER TABLE public.zonas_risco_reportes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reporte insere proprio" ON public.zonas_risco_reportes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "reporte le proprio ou operacao" ON public.zonas_risco_reportes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(),'administrador') OR private.has_role(auth.uid(),'gestor') OR private.has_role(auth.uid(),'monitor'));
CREATE POLICY "reporte revisa operacao" ON public.zonas_risco_reportes FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'administrador') OR private.has_role(auth.uid(),'gestor') OR private.has_role(auth.uid(),'monitor'));

CREATE TRIGGER zonas_risco_updated BEFORE UPDATE ON public.zonas_risco FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.zonas_risco (nome,tipo,nivel,lat,lng,raio_m,uf,horario_critico,recomendacao) VALUES
('ZONA LESTE - ITAQUERA/SÃO MATEUS','roubo',4,-23.565,-46.445,6000,'SP','20h-6h','Evite paradas; não pernoite. Mantenha rota pela Jacu-Pêssego sem desvio.'),
('GUARULHOS - CUMBICA/BONSUCESSO','roubo',4,-23.44,-46.45,6000,'SP','22h-5h','Entregas apenas em horário comercial; comunique chegada à operação.'),
('MARGINAL TIETÊ - VILA MARIA/VILA GUILHERME','roubo',4,-23.515,-46.585,4000,'SP','18h-6h','Não pare em acostamento; atenção a abordagens em congestionamento.'),
('CEAGESP / VILA LEOPOLDINA','assalto',3,-23.535,-46.74,2500,'SP','2h-7h','Aguarde descarga em pátio fechado.'),
('OSASCO / BARUERI - ANHANGUERA KM 18-25','roubo',3,-23.52,-46.82,5000,'SP','20h-5h','Mantenha velocidade; não aceite desvios.'),
('ABC - SÃO BERNARDO/DIADEMA (ANCHIETA)','roubo',3,-23.69,-46.6,5000,'SP','21h-5h','Evite saída noturna sem escolta para carga visada.'),
('MAUÁ / SANTO ANDRÉ - AV. DOS ESTADOS','roubo',3,-23.655,-46.47,4000,'SP','20h-5h','Evite paradas em semáforos isolados.'),
('ZONA SUL - CAPÃO REDONDO/M BOI MIRIM','assalto',3,-23.67,-46.77,5000,'SP','20h-6h','Prefira corredores principais.'),
('RODOANEL TRECHO OESTE - EMBU/TABOÃO','roubo',3,-23.63,-46.83,5000,'SP','22h-5h','Não pare nos acessos.'),
('ZONA NORTE - BRASILÂNDIA/FREGUESIA DO Ó','assalto',3,-23.47,-46.69,4000,'SP','20h-6h','Evite ruas secundárias.'),
('CENTRO SP - BRÁS/PARI','assalto',2,-23.54,-46.615,2500,'SP','19h-6h','Descarga só com local confirmado.'),
('DUTRA - ARUJÁ/ITAQUAQUECETUBA','roubo',4,-23.4,-46.33,7000,'SP','22h-5h','Trecho com histórico alto de roubo de carga; não pare.'),
('DUTRA - SÃO JOSÉ DOS CAMPOS/JACAREÍ','roubo',2,-23.2,-45.9,8000,'SP','0h-5h','Use pontos de parada credenciados.'),
('FERNÃO DIAS - MAIRIPORÃ/ATIBAIA','roubo',3,-23.25,-46.55,8000,'SP','22h-5h','Serra com baixa velocidade: atenção redobrada.'),
('ANHANGUERA/BANDEIRANTES - CAJAMAR/JUNDIAÍ','roubo',3,-23.33,-46.86,8000,'SP','22h-5h','Polo logístico visado; evite pátio aberto.'),
('CAMPINAS - VIRACOPOS/D. PEDRO','roubo',3,-22.95,-47.1,8000,'SP','22h-5h','Pernoite apenas em local seguro.'),
('RÉGIS BITTENCOURT - EMBU/ITAPECERICA','acidente',3,-23.7,-46.88,8000,'SP','Chuva/noite','Serra perigosa: reduza velocidade e mantenha distância.'),
('RÉGIS BITTENCOURT - SERRA DO CAFEZAL','acidente',4,-24.05,-47.95,10000,'SP','Chuva/neblina','Alto índice de acidentes graves.'),
('ANCHIETA/IMIGRANTES - SERRA DO MAR','acidente',3,-23.85,-46.5,7000,'SP','Neblina','Freio motor e marcha reduzida na descida.'),
('CASTELLO BRANCO - BARUERI/SOROCABA','roubo',2,-23.48,-47.1,9000,'SP','22h-5h','Pare apenas em postos credenciados.'),
('RIO DE JANEIRO - AV. BRASIL','roubo',4,-22.85,-43.3,8000,'RJ','24h','Região de maior roubo de carga do país; trafegue sem paradas.'),
('BAIXADA FLUMINENSE - DUQUE DE CAXIAS/WASHINGTON LUÍS','roubo',4,-22.75,-43.3,9000,'RJ','24h','Exigir escolta para carga visada.'),
('ARCO METROPOLITANO RJ','roubo',4,-22.72,-43.55,10000,'RJ','24h','Não pare em hipótese alguma.'),
('SÃO GONÇALO / NITERÓI - BR-101','roubo',3,-22.82,-43.05,8000,'RJ','20h-6h','Evite paradas.'),
('DUTRA RJ - RESENDE/BARRA MANSA','roubo',3,-22.5,-44.2,10000,'RJ','22h-5h','Atenção a falsos bloqueios.'),
('GRANDE BH - CONTAGEM/BETIM (BR-381)','roubo',3,-19.93,-44.05,9000,'MG','22h-5h','Polo industrial visado.'),
('BR-381 - FERNÃO DIAS MG (POUSO ALEGRE)','acidente',3,-22.2,-46.0,12000,'MG','Noite','Pista sinuosa; alto índice de acidentes.'),
('BR-116 BA - FEIRA DE SANTANA/VITÓRIA DA CONQUISTA','roubo',4,-12.6,-39.1,25000,'BA','20h-6h','Trecho crítico de roubo de carga e acidentes.'),
('SALVADOR - BR-324','roubo',3,-12.85,-38.45,10000,'BA','20h-6h','Evite paradas.'),
('REGIÃO METROPOLITANA DO RECIFE - BR-101/BR-232','roubo',3,-8.1,-35.0,15000,'PE','20h-6h','Pare apenas em locais credenciados.'),
('BR-101 NE - ALAGOAS/SERGIPE','roubo',2,-10.3,-36.6,25000,'AL','Noite','Atenção a trechos ermos.'),
('BR-153 GO/TO - ANÁPOLIS/PORANGATU','roubo',3,-15.5,-49.1,30000,'GO','Noite','Corredor de carreta visado; pernoite em posto seguro.'),
('BR-364 MT/RO - CUIABÁ/RONDONÓPOLIS','acidente',3,-16.0,-55.3,30000,'MT','Noite','Alto fluxo de bitrem; acidentes frequentes.'),
('BR-163 MT - SINOP/SORRISO','acidente',2,-12.2,-55.7,40000,'MT','Noite','Pista simples com tráfego pesado.'),
('BR-116 PR - CURITIBA/SERRA DO MAR','acidente',3,-25.6,-49.15,15000,'PR','Neblina','Serra perigosa.'),
('BR-277 PR - PARANAGUÁ','roubo',2,-25.55,-48.6,12000,'PR','Noite','Atenção ao acesso portuário.'),
('BR-101 SC - JOINVILLE/ITAJAÍ','acidente',2,-26.9,-48.7,20000,'SC','Pico','Congestionamento e acidentes.'),
('BR-116 RS - PORTO ALEGRE/CANOAS','roubo',3,-29.9,-51.18,12000,'RS','20h-6h','Evite paradas noturnas.'),
('BR-040 RJ/MG - PETRÓPOLIS/JUIZ DE FORA','acidente',3,-22.4,-43.2,15000,'RJ','Chuva','Serra com histórico de acidentes.'),
('FORTALEZA - BR-116/ANEL VIÁRIO','roubo',3,-3.8,-38.55,12000,'CE','20h-6h','Evite paradas.');