/** Fail closed for customer chats; null destination means the internal control tower. */
export function destinoRecebeAlerta(
  destino: { cliente_id: string | null },
  notificacao: { cliente_id: string | null; viagem_id: string | null },
) {
  if (destino.cliente_id === null) return true;
  return notificacao.viagem_id !== null && notificacao.cliente_id === destino.cliente_id;
}