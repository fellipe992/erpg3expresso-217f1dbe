# Prompt para o GitHub Copilot Agent — remover READ_MEDIA_IMAGES (política do Google Play)

> Cole o texto abaixo no Copilot Agent do repositório do app Android
> (projeto Capacitor gerado em `android/`).

---

**Tarefa:** adequar o app G3 Motorista à política de permissões de fotos/vídeos
do Google Play. O app foi recusado porque solicita `READ_MEDIA_IMAGES`; o Google
exige o uso do seletor de fotos do sistema (Photo Picker) em vez dessa permissão.

**Contexto:** o app é Capacitor e usa o plugin `@capacitor/camera` com
`CameraSource.Prompt` ("Tirar foto" ou "Galeria"). Esse plugin já usa o seletor
do sistema no Android 13+ e **não precisa** da permissão `READ_MEDIA_IMAGES`.
A permissão está declarada no manifest por herança de versões antigas e pode ser
removida com segurança.

**O que fazer:**

1. Em `android/app/src/main/AndroidManifest.xml`, **remover** a linha:

   ```xml
   <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
   ```

   Se existir também `READ_MEDIA_VIDEO` ou `READ_EXTERNAL_STORAGE`, remover
   igualmente. **Manter** a permissão `CAMERA` (ela é permitida e necessária
   para tirar fotos).

2. Verificar se algum código Kotlin/Java referencia `READ_MEDIA_IMAGES`
   (ex.: `checkSelfPermission`, `requestPermissions` com essa constante) e
   remover essas referências. O fluxo de seleção de imagem deve continuar
   funcionando apenas via seletor do sistema / plugin Capacitor.

3. Em `android/app/build.gradle` (módulo app), incrementar a versão para
   reenvio:
   - `versionCode`: somar +1 ao valor atual;
   - `versionName`: atualizar (ex.: `1.0.0` → `1.0.1`).

4. Rodar `bunx cap sync android` (ou `npx cap sync android`) e compilar.

**Não alterar:** nenhuma outra permissão (localização, notificações, boot,
wake lock etc.), nenhum serviço/receiver de rastreamento, nem o código React.

**Critérios de aceite (testar no aparelho com Android 13+):**

- O app instala e abre normalmente.
- No perfil do motorista, "Alterar foto" abre o seletor (câmera ou galeria) e
  a foto é enviada sem erro de permissão.
- No envio de fotos da viagem (checklist, canhoto, ocorrência), "Tirar foto ou
  escolher da galeria" funciona sem erro de permissão.
- `adb shell dumpsys package br.com.g3expresso.motorista | grep READ_MEDIA`
  não lista `READ_MEDIA_IMAGES` como solicitada.

**Depois:** gerar o Signed App Bundle (.aab) release com o mesmo keystore e
reenviar na mesma faixa do Play Console onde houve a recusa.
