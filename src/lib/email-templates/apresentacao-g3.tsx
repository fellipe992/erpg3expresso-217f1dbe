import React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  nome?: string
  empresa?: string
}

const Email = ({ nome }: Props) => {
  const saudacao = nome && nome.trim() ? `Olá, ${nome.trim()},` : 'Olá,'
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Como está, hoje, a entrega dos seus produtos até o cliente final?</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={barra} />
          <Heading style={h1}>Como está a entrega dos seus produtos até o cliente final?</Heading>

          <Text style={p}>{saudacao}</Text>

          <Text style={p}>
            Antes de falar sobre nós, uma pergunta simples: como está, hoje, o processo de entrega
            dos seus produtos até o seu cliente final?
          </Text>

          <Text style={p}>
            Se a resposta não veio de forma imediata e segura, talvez seja um sinal de que a operação
            logística está consumindo mais tempo e recursos do que deveria — e contribuindo menos do
            que poderia para o crescimento do seu negócio.
          </Text>

          <Text style={p}>É exatamente nesse ponto que a G3 Expresso atua.</Text>

          <Text style={p}>
            Somos uma transportadora especializada em operações dedicadas, com foco em carga seca,
            carga refrigerada e distribuição urbana e regional. Mas, mais do que transportar,
            trabalhamos como uma extensão da operação logística dos nossos clientes, cuidando dos
            detalhes que normalmente drenam tempo e energia interna.
          </Text>

          <Text style={p}>
            Um dos pontos que mais diferencia a forma como operamos é o acesso direto que
            oferecemos: nossos clientes acompanham, em tempo real, onde estão as entregas, quem são
            os motoristas responsáveis e como cada etapa foi organizada e finalizada — sem depender
            de ligações ou cobranças manuais para saber “onde está minha carga”.
          </Text>

          <Text style={p}>
            Sabemos também que dois dos maiores desafios de uma operação logística hoje são a
            dificuldade de captar veículos qualificados e o custo elevado de manter uma equipe
            interna só para isso, além da dificuldade real de fidelizar motoristas de confiança. É
            justamente aí que concentramos boa parte do nosso trabalho: selecionamos motoristas que
            fazem sentido para o perfil de cada operação, oferecemos suporte ativo na estrada e
            estruturamos cada operação de acordo com a realidade específica do cliente — sem aplicar
            um modelo genérico e engessado.
          </Text>

          <Text style={p}>
            Na prática, isso significa menos tempo resolvendo problemas de transporte e mais tempo
            dedicado ao que realmente importa para o seu negócio.
          </Text>

          <Text style={p}>
            Se fizer sentido, ficaria feliz em te mostrar, com mais detalhes, como estruturamos essas
            operações e como isso poderia se aplicar à sua realidade.
          </Text>

          <Text style={p}>Um abraço,</Text>

          <Hr style={hr} />

          <Text style={assinaturaNome}>Fellipe Chaves</Text>
          <Text style={assinatura}>G3 Expresso — o seu melhor parceiro logístico</Text>
          <Text style={assinatura}>
            <Link href="https://www.g3expresso.com.br" style={link}>
              www.g3expresso.com.br
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: 'Como está a entrega dos seus produtos até o cliente final?',
  displayName: 'Apresentação G3 Expresso (prospecção)',
  previewData: { nome: 'Marcos', empresa: 'Distribuidora Exemplo' },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "Arial, Helvetica, sans-serif",
  color: '#141414',
}

const container = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '24px 28px 40px',
}

const barra = {
  height: '4px',
  backgroundColor: '#F15A24',
  borderRadius: '4px',
  marginBottom: '24px',
}

const h1 = {
  fontSize: '20px',
  lineHeight: '28px',
  fontWeight: 'bold',
  color: '#141414',
  margin: '0 0 20px',
}

const p = {
  fontSize: '15px',
  lineHeight: '24px',
  color: '#141414',
  margin: '0 0 16px',
}

const hr = { borderColor: '#e5e5e5', margin: '24px 0 16px' }

const assinaturaNome = {
  fontSize: '15px',
  lineHeight: '22px',
  fontWeight: 'bold',
  color: '#141414',
  margin: '0 0 4px',
}

const assinatura = {
  fontSize: '13px',
  lineHeight: '20px',
  color: '#7C7C7C',
  margin: '0 0 4px',
}

const link = { color: '#F15A24', textDecoration: 'none' }

export default Email
