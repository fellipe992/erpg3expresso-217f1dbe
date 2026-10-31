# Prompt para o Copilot — liberar o microfone no app

Cole o bloco abaixo no Copilot do Visual Studio (paste). Ele libera o botão
**"Falar contexto"** do Treinador dentro do APK.

```
Leia e execute android-native/PROMPT-COPILOT-MICROFONE.md.
Resumo:
1) Copie android-native/app/src/main/java/br/com/g3expresso/motorista/G3PermissionsPlugin.kt
   para android/app/src/main/java/br/com/g3expresso/motorista/ (sobrescreva).
2) Copie android-native/app/src/main/java/br/com/g3expresso/motorista/MainActivity.kt
   para o mesmo destino em android/ (apague MainActivity.java se existir).
   Ela registra G3TrackingPlugin e G3PermissionsPlugin.
3) Confira que android/app/src/main/AndroidManifest.xml tem
   <uses-permission android:name="android.permission.RECORD_AUDIO" />
   (use o manifest de android-native/ se faltar).
4) Aumente o versionCode, rode "bunx cap sync android" e gere a APK release.
Aceite: no app, ao tocar em "Falar contexto", o Android mostra a janela
"Permitir que G3 Motorista use o microfone?"; após permitir, a gravação
começa e o texto aparece no campo Contexto.
```

## O que o plugin faz

| Método | Efeito |
| --- | --- |
| `ensureMicrophone()` | mostra a janela do Android e devolve `{ granted }` |
| `isMicrophoneGranted()` | só consulta, sem janela |
| `openSettings()` | abre Ajustes > Apps > G3 Motorista (quando o usuário marcou "não perguntar de novo") |

O navegador interno do app só entrega o microfone depois que o Android já
concedeu a permissão — por isso o app chama `ensureMicrophone()` antes de
gravar. Se a permissão estiver bloqueada, a tela mostra um botão **Ajustes**
que abre a página certa do sistema.

## Se ainda falhar

- A janela do Android não aparece e o app mostra "Ajustes": a permissão foi
  negada com "não perguntar de novo" — toque em **Ajustes**, ative o microfone
  e volte.
- Aparece "Este aparelho não permite gravar áudio aqui": a APK é antiga
  (sem o plugin) ou o WebView não expõe gravação — gere a APK nova.
- O microfone funciona no navegador e não funciona no app: a APK instalada
  ainda é a antiga; desinstale e instale a nova.
