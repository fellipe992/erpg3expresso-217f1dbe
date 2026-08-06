export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      abastecimentos: {
        Row: {
          combustivel: string | null
          comprovante_path: string | null
          consumo_medio: number | null
          created_at: string
          created_by: string | null
          custo_por_km: number | null
          data: string
          forma_pagamento_operacional: string | null
          hora: string | null
          id: string
          km_atual: number
          km_percorridos: number | null
          litros: number
          motorista_id: string | null
          observacoes: string | null
          posto: string | null
          updated_at: string
          valor_litro: number
          valor_total: number
          veiculo_id: string
          viagem_id: string | null
        }
        Insert: {
          combustivel?: string | null
          comprovante_path?: string | null
          consumo_medio?: number | null
          created_at?: string
          created_by?: string | null
          custo_por_km?: number | null
          data: string
          forma_pagamento_operacional?: string | null
          hora?: string | null
          id?: string
          km_atual: number
          km_percorridos?: number | null
          litros: number
          motorista_id?: string | null
          observacoes?: string | null
          posto?: string | null
          updated_at?: string
          valor_litro: number
          valor_total: number
          veiculo_id: string
          viagem_id?: string | null
        }
        Update: {
          combustivel?: string | null
          comprovante_path?: string | null
          consumo_medio?: number | null
          created_at?: string
          created_by?: string | null
          custo_por_km?: number | null
          data?: string
          forma_pagamento_operacional?: string | null
          hora?: string | null
          id?: string
          km_atual?: number
          km_percorridos?: number | null
          litros?: number
          motorista_id?: string | null
          observacoes?: string | null
          posto?: string | null
          updated_at?: string
          valor_litro?: number
          valor_total?: number
          veiculo_id?: string
          viagem_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abastecimentos_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimentos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimentos_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      centros_custo: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      checklists: {
        Row: {
          agua_radiador_ok: boolean | null
          combustivel_pct: number | null
          created_at: string
          created_by: string | null
          foto_url: string | null
          freios_ok: boolean | null
          id: string
          itens: Json
          km: number | null
          observacoes: string | null
          oleo_ok: boolean | null
          pneus_ok: boolean | null
          tacografo_ok: boolean | null
          tipo: Database["public"]["Enums"]["checklist_tipo"]
          updated_at: string
          viagem_id: string
        }
        Insert: {
          agua_radiador_ok?: boolean | null
          combustivel_pct?: number | null
          created_at?: string
          created_by?: string | null
          foto_url?: string | null
          freios_ok?: boolean | null
          id?: string
          itens?: Json
          km?: number | null
          observacoes?: string | null
          oleo_ok?: boolean | null
          pneus_ok?: boolean | null
          tacografo_ok?: boolean | null
          tipo: Database["public"]["Enums"]["checklist_tipo"]
          updated_at?: string
          viagem_id: string
        }
        Update: {
          agua_radiador_ok?: boolean | null
          combustivel_pct?: number | null
          created_at?: string
          created_by?: string | null
          foto_url?: string | null
          freios_ok?: boolean | null
          id?: string
          itens?: Json
          km?: number | null
          observacoes?: string | null
          oleo_ok?: boolean | null
          pneus_ok?: boolean | null
          tacografo_ok?: boolean | null
          tipo?: Database["public"]["Enums"]["checklist_tipo"]
          updated_at?: string
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklists_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          ativo: boolean
          cep: string | null
          cidade: string | null
          cnpj_cpf: string | null
          contato_nome: string | null
          created_at: string
          email: string | null
          endereco: string | null
          id: string
          inscricao_estadual: string | null
          nome_fantasia: string | null
          observacoes: string | null
          razao_social: string
          telefone: string | null
          tipo: Database["public"]["Enums"]["pessoa_tipo"]
          uf: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cep?: string | null
          cidade?: string | null
          cnpj_cpf?: string | null
          contato_nome?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          inscricao_estadual?: string | null
          nome_fantasia?: string | null
          observacoes?: string | null
          razao_social: string
          telefone?: string | null
          tipo?: Database["public"]["Enums"]["pessoa_tipo"]
          uf?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cep?: string | null
          cidade?: string | null
          cnpj_cpf?: string | null
          contato_nome?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          inscricao_estadual?: string | null
          nome_fantasia?: string | null
          observacoes?: string | null
          razao_social?: string
          telefone?: string | null
          tipo?: Database["public"]["Enums"]["pessoa_tipo"]
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          cnpj: string | null
          created_at: string
          email: string | null
          endereco: string | null
          id: string
          logo_url: string | null
          nome_fantasia: string
          razao_social: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          logo_url?: string | null
          nome_fantasia?: string
          razao_social?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          logo_url?: string | null
          nome_fantasia?: string
          razao_social?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_atividades: {
        Row: {
          cliente_id: string | null
          created_at: string
          descricao: string | null
          id: string
          lead_id: string | null
          metadata: Json
          oportunidade_id: string | null
          tipo: string
          titulo: string
          usuario_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          oportunidade_id?: string | null
          tipo: string
          titulo: string
          usuario_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          oportunidade_id?: string | null
          tipo?: string
          titulo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_atividades_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_atividades_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_atividades_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "crm_oportunidades"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_etapas: {
        Row: {
          ativo: boolean
          codigo: string
          cor: string
          created_at: string
          id: string
          nome: string
          ordem: number
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          cor?: string
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          cor?: string
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_etiquetas: {
        Row: {
          cor: string
          created_at: string
          created_by: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          cor?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          cor?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_leads: {
        Row: {
          cargo: string | null
          cidade: string | null
          classificacao: string | null
          cliente_id: string | null
          cnpj_cpf: string | null
          contato_nome: string | null
          created_at: string
          created_by: string | null
          email: string | null
          empresa: string
          etiquetas: string[]
          id: string
          observacoes: string | null
          origem: string | null
          potencial_faturamento: number | null
          prioridade: string
          proximo_contato: string | null
          responsavel_id: string | null
          segmento: string | null
          status: string
          telefone: string | null
          uf: string | null
          ultimo_contato: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          cargo?: string | null
          cidade?: string | null
          classificacao?: string | null
          cliente_id?: string | null
          cnpj_cpf?: string | null
          contato_nome?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          empresa: string
          etiquetas?: string[]
          id?: string
          observacoes?: string | null
          origem?: string | null
          potencial_faturamento?: number | null
          prioridade?: string
          proximo_contato?: string | null
          responsavel_id?: string | null
          segmento?: string | null
          status?: string
          telefone?: string | null
          uf?: string | null
          ultimo_contato?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          cargo?: string | null
          cidade?: string | null
          classificacao?: string | null
          cliente_id?: string | null
          cnpj_cpf?: string | null
          contato_nome?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          empresa?: string
          etiquetas?: string[]
          id?: string
          observacoes?: string | null
          origem?: string | null
          potencial_faturamento?: number | null
          prioridade?: string
          proximo_contato?: string | null
          responsavel_id?: string | null
          segmento?: string | null
          status?: string
          telefone?: string | null
          uf?: string | null
          ultimo_contato?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_oportunidades: {
        Row: {
          cliente_id: string | null
          contato_email: string | null
          contato_nome: string | null
          contato_telefone: string | null
          created_at: string
          created_by: string | null
          data_prevista: string | null
          descricao: string | null
          etapa_id: string
          fechada_em: string | null
          id: string
          lead_id: string | null
          motivo_perda: string | null
          observacoes: string | null
          origem: string | null
          probabilidade: number
          responsavel_id: string | null
          servicos: string | null
          titulo: string
          updated_at: string
          valor_estimado: number
          valor_fechado: number | null
        }
        Insert: {
          cliente_id?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          created_at?: string
          created_by?: string | null
          data_prevista?: string | null
          descricao?: string | null
          etapa_id: string
          fechada_em?: string | null
          id?: string
          lead_id?: string | null
          motivo_perda?: string | null
          observacoes?: string | null
          origem?: string | null
          probabilidade?: number
          responsavel_id?: string | null
          servicos?: string | null
          titulo: string
          updated_at?: string
          valor_estimado?: number
          valor_fechado?: number | null
        }
        Update: {
          cliente_id?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          created_at?: string
          created_by?: string | null
          data_prevista?: string | null
          descricao?: string | null
          etapa_id?: string
          fechada_em?: string | null
          id?: string
          lead_id?: string | null
          motivo_perda?: string | null
          observacoes?: string | null
          origem?: string | null
          probabilidade?: number
          responsavel_id?: string | null
          servicos?: string | null
          titulo?: string
          updated_at?: string
          valor_estimado?: number
          valor_fechado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_oportunidades_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_oportunidades_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "crm_etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_oportunidades_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_lancamentos: {
        Row: {
          categoria: string | null
          centro_custo: string | null
          cliente_id: string | null
          created_at: string
          created_by: string | null
          data_emissao: string
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"] | null
          fornecedor_id: string | null
          id: string
          motorista_id: string | null
          numero_documento: string | null
          observacoes: string | null
          origem: string | null
          origem_id: string | null
          plano_conta_id: string | null
          status: Database["public"]["Enums"]["financeiro_status"]
          tipo: Database["public"]["Enums"]["financeiro_tipo"]
          updated_at: string
          valor: number
          veiculo_id: string | null
          viagem_id: string | null
        }
        Insert: {
          categoria?: string | null
          centro_custo?: string | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao: string
          forma_pagamento?:
            | Database["public"]["Enums"]["forma_pagamento"]
            | null
          fornecedor_id?: string | null
          id?: string
          motorista_id?: string | null
          numero_documento?: string | null
          observacoes?: string | null
          origem?: string | null
          origem_id?: string | null
          plano_conta_id?: string | null
          status?: Database["public"]["Enums"]["financeiro_status"]
          tipo: Database["public"]["Enums"]["financeiro_tipo"]
          updated_at?: string
          valor: number
          veiculo_id?: string | null
          viagem_id?: string | null
        }
        Update: {
          categoria?: string | null
          centro_custo?: string | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string
          forma_pagamento?:
            | Database["public"]["Enums"]["forma_pagamento"]
            | null
          fornecedor_id?: string | null
          id?: string
          motorista_id?: string | null
          numero_documento?: string | null
          observacoes?: string | null
          origem?: string | null
          origem_id?: string | null
          plano_conta_id?: string | null
          status?: Database["public"]["Enums"]["financeiro_status"]
          tipo?: Database["public"]["Enums"]["financeiro_tipo"]
          updated_at?: string
          valor?: number
          veiculo_id?: string | null
          viagem_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_lancamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_plano_conta_id_fkey"
            columns: ["plano_conta_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          ativo: boolean
          categoria: Database["public"]["Enums"]["fornecedor_categoria"]
          cidade: string | null
          cnpj_cpf: string | null
          contato_nome: string | null
          created_at: string
          email: string | null
          endereco: string | null
          id: string
          nome_fantasia: string | null
          observacoes: string | null
          razao_social: string
          telefone: string | null
          tipo: Database["public"]["Enums"]["pessoa_tipo"]
          uf: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: Database["public"]["Enums"]["fornecedor_categoria"]
          cidade?: string | null
          cnpj_cpf?: string | null
          contato_nome?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nome_fantasia?: string | null
          observacoes?: string | null
          razao_social: string
          telefone?: string | null
          tipo?: Database["public"]["Enums"]["pessoa_tipo"]
          uf?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: Database["public"]["Enums"]["fornecedor_categoria"]
          cidade?: string | null
          cnpj_cpf?: string | null
          contato_nome?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nome_fantasia?: string | null
          observacoes?: string | null
          razao_social?: string
          telefone?: string | null
          tipo?: Database["public"]["Enums"]["pessoa_tipo"]
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      manutencoes: {
        Row: {
          created_at: string
          created_by: string | null
          data: string
          descricao: string | null
          fornecedor_id: string | null
          id: string
          km_atual: number | null
          motorista_id: string | null
          nota_path: string | null
          observacoes: string | null
          oficina: string | null
          proxima_revisao_data: string | null
          proxima_revisao_km: number | null
          tipo: string
          updated_at: string
          valor: number
          veiculo_id: string
          viagem_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data: string
          descricao?: string | null
          fornecedor_id?: string | null
          id?: string
          km_atual?: number | null
          motorista_id?: string | null
          nota_path?: string | null
          observacoes?: string | null
          oficina?: string | null
          proxima_revisao_data?: string | null
          proxima_revisao_km?: number | null
          tipo: string
          updated_at?: string
          valor?: number
          veiculo_id: string
          viagem_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string | null
          fornecedor_id?: string | null
          id?: string
          km_atual?: number | null
          motorista_id?: string | null
          nota_path?: string | null
          observacoes?: string | null
          oficina?: string | null
          proxima_revisao_data?: string | null
          proxima_revisao_km?: number | null
          tipo?: string
          updated_at?: string
          valor?: number
          veiculo_id?: string
          viagem_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manutencoes_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      monitor_clientes: {
        Row: {
          cliente_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitor_clientes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      motorista_veiculo_historico: {
        Row: {
          created_at: string
          data_fim: string | null
          data_inicio: string
          id: string
          motorista_id: string
          status: string
          updated_at: string
          veiculo_id: string
        }
        Insert: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          id?: string
          motorista_id: string
          status?: string
          updated_at?: string
          veiculo_id: string
        }
        Update: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          id?: string
          motorista_id?: string
          status?: string
          updated_at?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "motorista_veiculo_historico_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motorista_veiculo_historico_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      motoristas: {
        Row: {
          ativo: boolean
          cidade: string | null
          cnh: string | null
          cnh_categoria: string | null
          cnh_validade: string | null
          cpf: string | null
          created_at: string
          email: string | null
          endereco: string | null
          id: string
          nome: string
          observacoes: string | null
          telefone: string | null
          uf: string | null
          updated_at: string
          user_id: string | null
          veiculo_id: string | null
        }
        Insert: {
          ativo?: boolean
          cidade?: string | null
          cnh?: string | null
          cnh_categoria?: string | null
          cnh_validade?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string
          user_id?: string | null
          veiculo_id?: string | null
        }
        Update: {
          ativo?: boolean
          cidade?: string | null
          cnh?: string | null
          cnh_categoria?: string | null
          cnh_validade?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string
          user_id?: string | null
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "motoristas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          categoria: string
          created_at: string
          id: string
          lida_em: string | null
          link: string | null
          mensagem: string | null
          origem: string | null
          origem_id: string | null
          prioridade: string
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          categoria?: string
          created_at?: string
          id?: string
          lida_em?: string | null
          link?: string | null
          mensagem?: string | null
          origem?: string | null
          origem_id?: string | null
          prioridade?: string
          tipo?: string
          titulo: string
          user_id: string
        }
        Update: {
          categoria?: string
          created_at?: string
          id?: string
          lida_em?: string | null
          link?: string | null
          mensagem?: string | null
          origem?: string | null
          origem_id?: string | null
          prioridade?: string
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      plano_auditoria: {
        Row: {
          acao: string
          created_at: string
          dados_antes: Json | null
          dados_depois: Json | null
          descricao: string | null
          entidade: string
          entidade_id: string
          id: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          descricao?: string | null
          entidade: string
          entidade_id: string
          id?: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          descricao?: string | null
          entidade?: string
          entidade_id?: string
          id?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      plano_contas: {
        Row: {
          ativo: boolean
          centro_custo: string | null
          codigo: string
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nome: string
          subgrupo_id: string
          tipo: Database["public"]["Enums"]["plano_tipo"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          centro_custo?: string | null
          codigo: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome: string
          subgrupo_id: string
          tipo: Database["public"]["Enums"]["plano_tipo"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          centro_custo?: string | null
          codigo?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          subgrupo_id?: string
          tipo?: Database["public"]["Enums"]["plano_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plano_contas_subgrupo_id_fkey"
            columns: ["subgrupo_id"]
            isOneToOne: false
            referencedRelation: "plano_subgrupos"
            referencedColumns: ["id"]
          },
        ]
      }
      plano_grupos: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          created_by: string | null
          id: string
          nome: string
          ordem: number
          tipo: Database["public"]["Enums"]["plano_tipo"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          ordem?: number
          tipo: Database["public"]["Enums"]["plano_tipo"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          ordem?: number
          tipo?: Database["public"]["Enums"]["plano_tipo"]
          updated_at?: string
        }
        Relationships: []
      }
      plano_subgrupos: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          created_by: string | null
          grupo_id: string
          id: string
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          created_by?: string | null
          grupo_id: string
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          created_by?: string | null
          grupo_id?: string
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plano_subgrupos_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "plano_grupos"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      roteirizacao_projetos: {
        Row: {
          created_at: string
          created_by: string | null
          dados: Json
          data_operacao: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dados?: Json
          data_operacao?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dados?: Json
          data_operacao?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      simulacoes_viagem: {
        Row: {
          cliente_id: string | null
          comissao_percentual: number | null
          comissao_valor: number | null
          consumo_km_l: number | null
          created_at: string
          created_by: string | null
          custo_combustivel: number | null
          custo_pedagios: number | null
          custo_total: number | null
          destino: string
          distancia_km: number | null
          duracao_min: number | null
          eixos: number
          id: string
          litros: number | null
          lucro: number | null
          margem: number | null
          motorista_id: string | null
          nome: string | null
          origem: string
          paradas: Json
          polyline: string | null
          preco_combustivel: number | null
          provisao_manutencao_km: number | null
          provisao_pneus_km: number | null
          reboque_id: string | null
          tipo_rota: string
          tipo_veiculo: string
          updated_at: string
          valor_frete: number | null
          veiculo_id: string | null
          viagem_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          comissao_percentual?: number | null
          comissao_valor?: number | null
          consumo_km_l?: number | null
          created_at?: string
          created_by?: string | null
          custo_combustivel?: number | null
          custo_pedagios?: number | null
          custo_total?: number | null
          destino: string
          distancia_km?: number | null
          duracao_min?: number | null
          eixos?: number
          id?: string
          litros?: number | null
          lucro?: number | null
          margem?: number | null
          motorista_id?: string | null
          nome?: string | null
          origem: string
          paradas?: Json
          polyline?: string | null
          preco_combustivel?: number | null
          provisao_manutencao_km?: number | null
          provisao_pneus_km?: number | null
          reboque_id?: string | null
          tipo_rota?: string
          tipo_veiculo?: string
          updated_at?: string
          valor_frete?: number | null
          veiculo_id?: string | null
          viagem_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          comissao_percentual?: number | null
          comissao_valor?: number | null
          consumo_km_l?: number | null
          created_at?: string
          created_by?: string | null
          custo_combustivel?: number | null
          custo_pedagios?: number | null
          custo_total?: number | null
          destino?: string
          distancia_km?: number | null
          duracao_min?: number | null
          eixos?: number
          id?: string
          litros?: number | null
          lucro?: number | null
          margem?: number | null
          motorista_id?: string | null
          nome?: string | null
          origem?: string
          paradas?: Json
          polyline?: string | null
          preco_combustivel?: number | null
          provisao_manutencao_km?: number | null
          provisao_pneus_km?: number | null
          reboque_id?: string | null
          tipo_rota?: string
          tipo_veiculo?: string
          updated_at?: string
          valor_frete?: number | null
          veiculo_id?: string | null
          viagem_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "simulacoes_viagem_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulacoes_viagem_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulacoes_viagem_reboque_id_fkey"
            columns: ["reboque_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulacoes_viagem_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulacoes_viagem_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          casas_decimais: number
          default_theme: string
          dias_alerta_atraso: number
          dias_alerta_vencer: number
          id: string
          moeda: string
          notif_config: Json
          prazo_padrao_vencimento: number
          singleton: boolean
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          casas_decimais?: number
          default_theme?: string
          dias_alerta_atraso?: number
          dias_alerta_vencer?: number
          id?: string
          moeda?: string
          notif_config?: Json
          prazo_padrao_vencimento?: number
          singleton?: boolean
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          casas_decimais?: number
          default_theme?: string
          dias_alerta_atraso?: number
          dias_alerta_vencer?: number
          id?: string
          moeda?: string
          notif_config?: Json
          prazo_padrao_vencimento?: number
          singleton?: boolean
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      usuarios_auditoria: {
        Row: {
          acao: string
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          detalhes: Json | null
          id: string
          target_user_id: string
        }
        Insert: {
          acao: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          detalhes?: Json | null
          id?: string
          target_user_id: string
        }
        Update: {
          acao?: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          detalhes?: Json | null
          id?: string
          target_user_id?: string
        }
        Relationships: []
      }
      veiculos: {
        Row: {
          agregado: boolean
          ano: number | null
          ativo: boolean
          capacidade_kg: number | null
          chassi: string | null
          cor: string | null
          created_at: string
          crlv_validade: string | null
          id: string
          licenciamento_validade: string | null
          marca: string | null
          modelo: string
          observacoes: string | null
          placa: string
          proprietario_documento: string | null
          proprietario_nome: string | null
          proprietario_telefone: string | null
          provisao_manutencao_km: number | null
          provisao_pneus_km: number | null
          renavam: string | null
          seguro_validade: string | null
          tipo: Database["public"]["Enums"]["veiculo_tipo"]
          updated_at: string
        }
        Insert: {
          agregado?: boolean
          ano?: number | null
          ativo?: boolean
          capacidade_kg?: number | null
          chassi?: string | null
          cor?: string | null
          created_at?: string
          crlv_validade?: string | null
          id?: string
          licenciamento_validade?: string | null
          marca?: string | null
          modelo: string
          observacoes?: string | null
          placa: string
          proprietario_documento?: string | null
          proprietario_nome?: string | null
          proprietario_telefone?: string | null
          provisao_manutencao_km?: number | null
          provisao_pneus_km?: number | null
          renavam?: string | null
          seguro_validade?: string | null
          tipo?: Database["public"]["Enums"]["veiculo_tipo"]
          updated_at?: string
        }
        Update: {
          agregado?: boolean
          ano?: number | null
          ativo?: boolean
          capacidade_kg?: number | null
          chassi?: string | null
          cor?: string | null
          created_at?: string
          crlv_validade?: string | null
          id?: string
          licenciamento_validade?: string | null
          marca?: string | null
          modelo?: string
          observacoes?: string | null
          placa?: string
          proprietario_documento?: string | null
          proprietario_nome?: string | null
          proprietario_telefone?: string | null
          provisao_manutencao_km?: number | null
          provisao_pneus_km?: number | null
          renavam?: string | null
          seguro_validade?: string | null
          tipo?: Database["public"]["Enums"]["veiculo_tipo"]
          updated_at?: string
        }
        Relationships: []
      }
      viagem_anexos: {
        Row: {
          categoria: string
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          mime_type: string | null
          ocorrencia_id: string | null
          storage_path: string
          viagem_id: string
        }
        Insert: {
          categoria: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          mime_type?: string | null
          ocorrencia_id?: string | null
          storage_path: string
          viagem_id: string
        }
        Update: {
          categoria?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          mime_type?: string | null
          ocorrencia_id?: string | null
          storage_path?: string
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viagem_anexos_ocorrencia_id_fkey"
            columns: ["ocorrencia_id"]
            isOneToOne: false
            referencedRelation: "viagem_ocorrencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagem_anexos_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      viagem_auditoria: {
        Row: {
          created_at: string
          detalhes: Json | null
          evento: string
          id: string
          usuario_id: string | null
          viagem_id: string
        }
        Insert: {
          created_at?: string
          detalhes?: Json | null
          evento: string
          id?: string
          usuario_id?: string | null
          viagem_id: string
        }
        Update: {
          created_at?: string
          detalhes?: Json | null
          evento?: string
          id?: string
          usuario_id?: string | null
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viagem_auditoria_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      viagem_localizacoes: {
        Row: {
          bateria: number | null
          created_at: string
          created_by: string | null
          heading: number | null
          id: string
          latitude: number
          longitude: number
          motorista_id: string | null
          online: boolean | null
          precisao: number | null
          veiculo_id: string | null
          velocidade: number | null
          viagem_id: string
        }
        Insert: {
          bateria?: number | null
          created_at?: string
          created_by?: string | null
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          motorista_id?: string | null
          online?: boolean | null
          precisao?: number | null
          veiculo_id?: string | null
          velocidade?: number | null
          viagem_id: string
        }
        Update: {
          bateria?: number | null
          created_at?: string
          created_by?: string | null
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          motorista_id?: string | null
          online?: boolean | null
          precisao?: number | null
          veiculo_id?: string | null
          velocidade?: number | null
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viagem_localizacoes_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagem_localizacoes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagem_localizacoes_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      viagem_ocorrencias: {
        Row: {
          created_at: string
          created_by: string | null
          descricao: string
          id: string
          local: string | null
          motorista_id: string | null
          observacoes: string | null
          updated_at: string
          viagem_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descricao: string
          id?: string
          local?: string | null
          motorista_id?: string | null
          observacoes?: string | null
          updated_at?: string
          viagem_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descricao?: string
          id?: string
          local?: string | null
          motorista_id?: string | null
          observacoes?: string | null
          updated_at?: string
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viagem_ocorrencias_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagem_ocorrencias_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      viagens: {
        Row: {
          cliente_id: string | null
          codigo: string | null
          comissao_percentual: number | null
          comissao_valor: number | null
          created_at: string
          created_by: string | null
          data_chegada: string | null
          data_prevista_chegada: string | null
          data_prevista_saida: string | null
          data_saida: string | null
          destino_cidade: string | null
          destino_uf: string | null
          distancia_estimada_km: number | null
          finalizada_por: string | null
          id: string
          iniciada_por: string | null
          km_final: number | null
          km_inicial: number | null
          motorista_id: string | null
          observacoes: string | null
          observacoes_finais: string | null
          origem_cidade: string | null
          origem_uf: string | null
          outros_custos_estimados: number | null
          pedagio_estimado: number | null
          provisao_manutencao_km: number | null
          provisao_pneus_km: number | null
          status: Database["public"]["Enums"]["viagem_status"]
          updated_at: string
          valor_frete: number | null
          veiculo_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          codigo?: string | null
          comissao_percentual?: number | null
          comissao_valor?: number | null
          created_at?: string
          created_by?: string | null
          data_chegada?: string | null
          data_prevista_chegada?: string | null
          data_prevista_saida?: string | null
          data_saida?: string | null
          destino_cidade?: string | null
          destino_uf?: string | null
          distancia_estimada_km?: number | null
          finalizada_por?: string | null
          id?: string
          iniciada_por?: string | null
          km_final?: number | null
          km_inicial?: number | null
          motorista_id?: string | null
          observacoes?: string | null
          observacoes_finais?: string | null
          origem_cidade?: string | null
          origem_uf?: string | null
          outros_custos_estimados?: number | null
          pedagio_estimado?: number | null
          provisao_manutencao_km?: number | null
          provisao_pneus_km?: number | null
          status?: Database["public"]["Enums"]["viagem_status"]
          updated_at?: string
          valor_frete?: number | null
          veiculo_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          codigo?: string | null
          comissao_percentual?: number | null
          comissao_valor?: number | null
          created_at?: string
          created_by?: string | null
          data_chegada?: string | null
          data_prevista_chegada?: string | null
          data_prevista_saida?: string | null
          data_saida?: string | null
          destino_cidade?: string | null
          destino_uf?: string | null
          distancia_estimada_km?: number | null
          finalizada_por?: string | null
          id?: string
          iniciada_por?: string | null
          km_final?: number | null
          km_inicial?: number | null
          motorista_id?: string | null
          observacoes?: string | null
          observacoes_finais?: string | null
          origem_cidade?: string | null
          origem_uf?: string | null
          outros_custos_estimados?: number | null
          pedagio_estimado?: number | null
          provisao_manutencao_km?: number | null
          provisao_pneus_km?: number | null
          status?: Database["public"]["Enums"]["viagem_status"]
          updated_at?: string
          valor_frete?: number | null
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "viagens_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagens_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagens_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      gerar_notificacoes_alertas: { Args: never; Returns: undefined }
      get_primary_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      marcar_atrasados: { Args: never; Returns: undefined }
      monitoramento_viagens_ativas: {
        Args: never
        Returns: {
          cliente_nome: string
          codigo: string
          data_saida: string
          destino_cidade: string
          destino_uf: string
          id: string
          km_inicial: number
          motorista_id: string
          motorista_nome: string
          motorista_telefone: string
          origem_cidade: string
          origem_uf: string
          veiculo_agregado: boolean
          veiculo_id: string
          veiculo_marca: string
          veiculo_modelo: string
          veiculo_placa: string
        }[]
      }
    }
    Enums: {
      app_role:
        | "administrador"
        | "financeiro"
        | "gestor"
        | "motorista"
        | "monitor"
      checklist_tipo: "saida" | "chegada"
      financeiro_status: "pendente" | "pago" | "atrasado" | "cancelado"
      financeiro_tipo: "receber" | "pagar"
      forma_pagamento:
        | "dinheiro"
        | "pix"
        | "boleto"
        | "ted"
        | "cartao_credito"
        | "cartao_debito"
        | "cheque"
        | "outro"
      fornecedor_categoria:
        | "combustivel"
        | "manutencao"
        | "pneu"
        | "seguro"
        | "peca"
        | "servico"
        | "outros"
      pessoa_tipo: "pf" | "pj"
      plano_tipo: "receita" | "despesa" | "outros"
      veiculo_tipo:
        | "cavalo"
        | "carreta"
        | "truck"
        | "toco"
        | "van"
        | "utilitario"
        | "outro"
      viagem_status: "planejada" | "em_andamento" | "concluida" | "cancelada"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "administrador",
        "financeiro",
        "gestor",
        "motorista",
        "monitor",
      ],
      checklist_tipo: ["saida", "chegada"],
      financeiro_status: ["pendente", "pago", "atrasado", "cancelado"],
      financeiro_tipo: ["receber", "pagar"],
      forma_pagamento: [
        "dinheiro",
        "pix",
        "boleto",
        "ted",
        "cartao_credito",
        "cartao_debito",
        "cheque",
        "outro",
      ],
      fornecedor_categoria: [
        "combustivel",
        "manutencao",
        "pneu",
        "seguro",
        "peca",
        "servico",
        "outros",
      ],
      pessoa_tipo: ["pf", "pj"],
      plano_tipo: ["receita", "despesa", "outros"],
      veiculo_tipo: [
        "cavalo",
        "carreta",
        "truck",
        "toco",
        "van",
        "utilitario",
        "outro",
      ],
      viagem_status: ["planejada", "em_andamento", "concluida", "cancelada"],
    },
  },
} as const
