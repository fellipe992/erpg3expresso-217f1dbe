# Prompt para o Copilot — corrigir ícone duplicado e notificação piscando

> Cole o texto abaixo no Copilot Agent do repositório do app Android (Capacitor).

---

**Problema 1 — ao instalar a APK aparecem DOIS ícones "G3 Motorista".**
Um único APK está registrando duas telas de entrada (duas `<activity>` com
`android.intent.action.MAIN` + `android.intent.category.LAUNCHER`) no manifest
final, ou existem duas `MainActivity` (uma `.java` e uma `.kt`, ou em pacotes
diferentes).

Faça:
1. Abra `android/app/build/intermediates/merged_manifests/release/AndroidManifest.xml`
   (ou "Merged Manifest" no Android Studio) e liste todas as activities com
   categoria `LAUNCHER`. Deve existir **apenas uma**: `br.com.g3expresso.motorista.MainActivity`.
2. Remova o `intent-filter` LAUNCHER de qualquer outra activity (SplashActivity,
   activity de plugin, MainActivity antiga). Se vier de biblioteca, adicione no
   manifest do app a mesma activity com
   `tools:node="merge"` e o intent-filter com `tools:node="remove"`.
3. Garanta que só exista `android/app/src/main/java/br/com/g3expresso/motorista/MainActivity.kt`.
   Apague `MainActivity.java` e qualquer `MainActivity` em outro pacote
   (ex.: `com/g3expresso/app/`, `io/ionic/starter/`).
4. Em `android/app/build.gradle` confira `namespace` e `applicationId` =
   `br.com.g3expresso.motorista`, sem `applicationIdSuffix` e sem
   `productFlavors` gerando dois apps.
5. Em `android/app/src/main/AndroidManifest.xml` use exatamente o arquivo de
   `android-native/app/src/main/AndroidManifest.xml` deste repositório.

**Problema 2 — notificação "G3 Motorista" piscando na barra e continuando
depois da viagem finalizada.**
O serviço de rastreamento estava sendo religado repetidamente
(`startForegroundService` chamado com o serviço já ativo, em `onTaskRemoved`,
`onDestroy` e no `stop()` com o serviço parado), repostando a notificação.

Faça: copie os arquivos atualizados, sobrescrevendo:

```bash
DEST=android/app/src/main/java/br/com/g3expresso/motorista
cp android-native/app/src/main/java/br/com/g3expresso/motorista/G3TrackingService.kt "$DEST"/
cp android-native/app/src/main/java/br/com/g3expresso/motorista/G3TrackingPlugin.kt "$DEST"/
cp android-native/app/src/main/java/br/com/g3expresso/motorista/G3BootReceiver.kt "$DEST"/
cp android-native/app/src/main/java/br/com/g3expresso/motorista/MainActivity.kt "$DEST"/
```

Mudanças já feitas nesses arquivos (não reverter):
- `startForegroundNotification()` posta a notificação **uma vez** por vida do
  serviço (`foregroundStarted`), com `setOnlyAlertOnce(true)`,
  `CATEGORY_SERVICE` e `FOREGROUND_SERVICE_TYPE_LOCATION` no Android 10+.
- `startIfActive()` não faz nada se o serviço já está rodando e trata a exceção
  de início em segundo plano do Android 12+.
- `onTaskRemoved()` só reagenda o alarme (o serviço já sobrevive com
  `stopWithTask="false"`).
- `stop()` do plugin com o serviço parado apenas limpa o estado, cancela o
  alarme e remove a notificação — não sobe o serviço só para derrubá-lo.
- Ao parar: `commit()` nas preferências e `cancel(NOTIF_ID)`.

Confirme também que existe `android/app/src/main/res/drawable/ic_stat_notify`
(PNG/vetor branco). Sem ele a notificação fica sem ícone/texto.

Depois: aumentar `versionCode` em `android/app/build.gradle`, rodar
`bunx cap sync android` e gerar a APK release.

**Critérios de aceite:**
- Instalar a APK num celular limpo mostra **um** ícone "G3 Motorista".
- Com viagem em andamento aparece **uma** notificação fixa "Viagem em
  andamento", sem piscar.
- Ao finalizar a viagem a notificação some em até 1 minuto e não volta.
