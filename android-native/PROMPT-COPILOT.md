# Prompt para o GitHub Copilot Agent — rastreamento contínuo (Android)

> Cole o texto abaixo no Copilot Agent do repositório do app Android
> (projeto Capacitor gerado em `android/`). Os arquivos de referência já estão
> atualizados neste repo em `android-native/` — o agente deve copiá-los/aplicá-los
> e ajustar o Gradle.

---

**Tarefa:** garantir que o rastreamento de localização do app G3 Motorista seja
totalmente automático: enquanto existir viagem em andamento, o app deve enviar a
localização em tempo real sem depender do motorista abrir o app, e só parar
quando a viagem for finalizada.

Requisitos funcionais (não altere o comportamento do banco nem os nomes de
campos usados no insert):

1. **Foreground Service persistente** (`G3TrackingService`, `foregroundServiceType="location"`,
   `stopWithTask="false"`, `PARTIAL_WAKE_LOCK`), usando
   `FusedLocationProviderClient` com `PRIORITY_HIGH_ACCURACY` e intervalo de 20s.
2. **Fila offline persistente**: quando não há internet (ou o POST falha por
   rede), a posição vai para `SharedPreferences` (`queue`, máx. 5000 itens).
   Cada linha deve levar `created_at` em ISO-8601 UTC com o horário **da captura**,
   para que a rota reconstruída mantenha a hora real de cada ponto.
3. **Reenvio automático ao voltar a rede**: registrar
   `ConnectivityManager.NetworkCallback` (`NET_CAPABILITY_INTERNET`) e esvaziar a
   fila em lotes de 100 no `onAvailable`; em caso de falha de rede, manter a fila
   intacta e tentar de novo depois.
4. **Watchdog de 60s** (Handler no main looper): reanexar o `LocationCallback` se
   o sistema o removeu (doze, GPS religado, troca de provider), tentar esvaziar a
   fila e reagendar o alarme de recuperação.
5. **Auto-recuperação do processo**: `AlarmManager.setAndAllowWhileIdle`
   (ELAPSED_REALTIME_WAKEUP, 5 min) disparando um `BroadcastReceiver`
   (`G3BootReceiver`) que religa o serviço via
   `G3TrackingService.startIfActive(context)` — só religa se houver viagem salva.
6. **Reinício após reboot/atualização**: o mesmo receiver escuta
   `BOOT_COMPLETED`, `QUICKBOOT_POWERON`, `MY_PACKAGE_REPLACED` e a action
   custom `br.com.g3expresso.motorista.TRACK_REVIVE`. Permissão
   `RECEIVE_BOOT_COMPLETED` no manifest.
7. **Sobreviver ao app fechado**: implementar `onTaskRemoved` e `onDestroy`
   religando o serviço enquanto houver viagem ativa salva.
8. **Parada definitiva só em `ACTION_STOP`** (chamado pelo JS quando não há mais
   viagem em andamento): aí sim cancelar o alarme, limpar `SharedPreferences`
   (incluindo a fila) e `stopSelf()`.
9. **Token**: renovar o `access_token` sozinho pelo `refresh_token` em resposta a
   HTTP 401 (`/auth/v1/token?grant_type=refresh_token`) e persistir os novos tokens.
   Recusa 403 com `row-level security` = viagem encerrada → **descartar** a linha
   (não reenfileirar).
10. **Permissões pedidas ao motorista**: localização precisa + "permitir o tempo
    todo" (`ACCESS_BACKGROUND_LOCATION`), notificações e isenção de otimização de
    bateria (`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`). Se o usuário negar,
    exibir aviso na notificação/UI.

**Como aplicar:**

```bash
DEST=android/app/src/main/java/br/com/g3expresso/motorista
mkdir -p "$DEST"
cp android-native/app/src/main/java/br/com/g3expresso/motorista/*.kt "$DEST"/
rm -f "$DEST"/MainActivity.java
cp android-native/app/src/main/AndroidManifest.xml android/app/src/main/AndroidManifest.xml
```

`android/app/build.gradle` → `dependencies { ... }`:

```gradle
implementation "com.google.android.gms:play-services-location:21.3.0"
implementation "com.squareup.okhttp3:okhttp:4.12.0"
```

Depois: `bunx cap sync android` e compilar. Não renomear a action
`br.com.g3expresso.motorista.TRACK_REVIVE` nem o nome do plugin `G3Tracking`,
pois o código React (`src/lib/tracking-native.ts`,
`src/hooks/use-viagem-tracking.tsx`) depende deles.

**Critérios de aceite (testar no aparelho):**

- Com viagem em andamento, ativar modo avião por 10 min: ao desativar, todos os
  pontos do período aparecem no monitoramento com os horários corretos.
- Fechar o app pela lista de recentes: a notificação continua e as posições seguem
  chegando.
- Reiniciar o celular: sem abrir o app, o serviço volta e o envio continua.
- Finalizar a viagem no app: a notificação desaparece e nenhum ponto novo é enviado.
