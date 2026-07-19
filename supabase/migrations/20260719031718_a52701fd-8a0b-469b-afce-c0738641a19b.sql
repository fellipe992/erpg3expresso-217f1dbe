-- Permitir motorista/staff removerem anexos de viagens ainda não concluídas

CREATE POLICY "motorista delete own anexos"
ON public.viagem_anexos FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.viagens v
    WHERE v.id = viagem_anexos.viagem_id
      AND v.motorista_id = current_motorista_id()
      AND v.status IN ('planejada','em_andamento')
  )
);

-- Storage: permitir motorista deletar fotos das próprias viagens em aberto
CREATE POLICY "Motorista exclui fotos de viagem em aberto"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'viagem-fotos'
  AND EXISTS (
    SELECT 1 FROM public.viagens v
    WHERE v.id::text = split_part(objects.name, '/', 1)
      AND v.motorista_id = current_motorista_id()
      AND v.status IN ('planejada','em_andamento')
  )
);