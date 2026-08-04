# G3 Motorista — App Android (Capacitor)

Este projeto é **um só código** que roda como ERP web e como app Android
para os motoristas. A APK instalada nos celulares carrega o site publicado
(`https://erp.g3expresso.com.br`) dentro de um WebView, com acesso total aos
recursos nativos do Android (GPS, câmera, notificações, GPS em segundo
plano, etc.) via plugins Capacitor.

**Vantagem:** toda mudança nas telas do motorista feita aqui no Lovable já
aparece na APK sem precisar recompilar/redistribuir. Só é preciso gerar
uma nova APK quando você adicionar/atualizar **plugins nativos**.

---

## Pré-requisitos (sua máquina)

1. **Node.js 20+** e **Bun** (ou npm/pnpm).
2. **Android Studio Hedgehog+** com **Android SDK 34** instalado.
3. **JDK 17** (o Android Studio já traz).
4. Um Google Cloud com **Maps SDK for Android** habilitado — a mesma chave
   que já usamos no ERP funciona (basta liberar o SHA-1 do keystore no
   Console).

---

## Passo a passo — do zero à APK

### 1) Clonar o projeto do GitHub

No topo do Lovable → **GitHub → Connect** (se ainda não conectou) → depois:

```bash
git clone https://github.com/<seu-usuário>/<seu-repo>.git
cd <seu-repo>
bun install     # ou npm install
```

### 2) Adicionar a plataforma Android (**só na primeira vez**)

```bash
bunx cap add android
```

Isso cria a pasta `android/` com o projeto Gradle. Faça commit dela — nas
próximas vezes você não precisa recriar.

### 3) Sincronizar as configurações do Capacitor

Sempre que você atualizar plugins ou o `capacitor.config.ts`, rode:

```bash
bunx cap sync android
```

> Observação: como o app usa `server.url` apontando para o site publicado,
> **você NÃO precisa rodar `bun run build`** para gerar `dist/` antes do
> `cap sync`. O `dist/` só é necessário se um dia você quiser embutir o
> bundle web dentro da APK (modo offline-first).

### 4) Configurar permissões no `AndroidManifest.xml`

Abra `android/app/src/main/AndroidManifest.xml` e garanta estas linhas
dentro de `<manifest>` (antes de `<application>`):

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
<uses-feature android:name="android.hardware.location.gps" android:required="true" />
```

Confirme também que existe o serviço em primeiro plano do plugin dentro de
`<application>` (o `cap sync` já adiciona; se faltar, o GPS para ao fechar o app):

```xml
<service
  android:name="com.equimper.backgroundgeolocation.BackgroundGeolocationService"
  android:foregroundServiceType="location"
  android:enabled="true"
  android:exported="false" />
```

### 4.1) Ajustes obrigatórios no celular do motorista

Sem estes 3 itens o Android mata o rastreamento assim que o motorista sai do app:

1. **Localização → "Permitir sempre"** (não "somente ao usar o app").
   Configurações → Apps → G3 Motorista → Permissões → Localização → *Permitir
   o tempo todo* + *Usar localização precisa*.
2. **Bateria sem restrição**: Configurações → Apps → G3 Motorista → Bateria →
   *Sem restrições / Não otimizar*. Em Xiaomi/Samsung/Motorola também é preciso
   marcar *Inicialização automática* e travar o app na lista de recentes.
3. **Notificações permitidas**: a notificação "Viagem em andamento" é o que mantém
   o serviço vivo. Se o motorista bloquear essa notificação, o Android encerra o serviço.



### 5) Abrir no Android Studio

```bash
bunx cap open android
```

O Android Studio abre. Aguarde o Gradle sync terminar.

### 6) Rodar no celular / gerar APK

**Testar no celular conectado por USB:**
1. Ative *Depuração USB* no celular.
2. No Android Studio, escolha o dispositivo no topo → clique em **Run ▶**.

**Gerar APK de release para distribuir:**
1. Menu **Build → Generate Signed App Bundle / APK…**
2. Escolha **APK** → **Next**.
3. Crie um keystore (`.jks`) na primeira vez — **guarde bem esse arquivo e
   a senha**, ele é necessário para todas as próximas atualizações.
4. Escolha **release** → **Finish**.
5. A APK sai em `android/app/release/app-release.apk`.

### 7) Distribuir para os motoristas

Envie o arquivo `.apk` por WhatsApp / Drive / link direto. No celular do
motorista, ele precisa **permitir instalação de fontes desconhecidas** uma
única vez (Configurações → Segurança).

---

## Comandos do dia a dia

| Situação | Comando |
| --- | --- |
| Mudou algo só nas telas (React) | Nada — já aparece na APK, é o site publicado. |
| Instalou / atualizou um plugin Capacitor | `bunx cap sync android` |
| Mudou `capacitor.config.ts` | `bunx cap sync android` |
| Adicionou um novo ícone/splash | `bunx cap sync android` + rebuild no Android Studio |
| Precisa depurar dentro do WebView | Chrome → `chrome://inspect` com o cel conectado |

---

## Plugins nativos já instalados

- `@capacitor/camera` — foto de checklist, ocorrências, canhoto, comprovante.
- `@capacitor/geolocation` — posição atual (foreground).
- `@capacitor-community/background-geolocation` — GPS em segundo plano
  enquanto houver viagem em andamento.
- `@capacitor/local-notifications` — nova viagem, alteração, cancelamento.
- `@capacitor/network` — detectar offline.
- `@capacitor/preferences` — cache local (fila offline).
- `@capacitor/filesystem` — armazenar fotos antes de subir.
- `@capacitor/app` — ciclo de vida (retomar tracking ao voltar).
- `@capacitor/device` — info do aparelho (bateria, modelo).
- `@capacitor/splash-screen`, `@capacitor/status-bar`, `@capacitor/keyboard`.

---

## Como o app "sabe" que é o motorista?

O login usa o **mesmo Supabase** do ERP. Assim que o motorista entra:

- O `useAuth` lê a `role` do `user_roles`.
- O layout `mobile-motorista-shell.tsx` já entrega uma UI mobile-first
  quando `role === "motorista"`.
- Nada de admin/gestor/financeiro aparece — as rotas do sidebar são
  filtradas por role em `app-sidebar.tsx`.

Se um administrador logar na APK, ele vai ver o ERP inteiro (útil para
testes). Se preferir bloquear, dá para adicionar no `route.tsx` do
`_authenticated`:

```ts
if (isNative() && role !== "motorista") {
  throw redirect({ to: "/auth" });
}
```

---

## Ícone e splash

Depois de rodar `cap add android`, use o assistente do Android Studio:
**File → New → Image Asset** para gerar ícones adaptativos a partir do
logo da G3 (`src/assets/g3-expresso-logo.png`). Para o splash, substitua
`android/app/src/main/res/drawable/splash.png`.

---

## Google Maps dentro do WebView

Já funciona automaticamente porque a APK carrega o mesmo site publicado
com a chave do Google Maps já configurada. Basta ter o domínio
`erp.g3expresso.com.br` na lista de **HTTP referrers** da chave (já está).
