# Arquivos nativos Android — Foreground Service de rastreamento

Estes arquivos substituem o rastreamento em JavaScript por um **Foreground
Service nativo** que usa `FusedLocationProviderClient` + `LocationCallback` e
envia cada posição direto ao banco (REST) por OkHttp. O WebView pode estar
congelado, minimizado ou com a tela apagada — o serviço continua enviando.

## Como aplicar

```bash
bun install
bunx cap add android      # só na primeira vez
```

Depois copie, sobrescrevendo:

| Arquivo deste diretório | Destino no projeto |
| --- | --- |
| `app/src/main/java/br/com/g3expresso/motorista/G3TrackingService.kt` | mesmo caminho em `android/` |
| `app/src/main/java/br/com/g3expresso/motorista/G3TrackingPlugin.kt` | mesmo caminho em `android/` |
| `app/src/main/java/br/com/g3expresso/motorista/MainActivity.kt` | mesmo caminho em `android/` (apague o `MainActivity.java` se existir) |
| `app/src/main/AndroidManifest.xml` | `android/app/src/main/AndroidManifest.xml` |

Comando pronto (a partir da raiz do repo):

```bash
DEST=android/app/src/main/java/br/com/g3expresso/motorista
mkdir -p "$DEST"
cp android-native/app/src/main/java/br/com/g3expresso/motorista/*.kt "$DEST"/
rm -f "$DEST"/MainActivity.java
cp android-native/app/src/main/AndroidManifest.xml android/app/src/main/AndroidManifest.xml
```

## Dependências Gradle

Em `android/app/build.gradle`, dentro de `dependencies { ... }`:

```gradle
implementation "com.google.android.gms:play-services-location:21.3.0"
implementation "com.squareup.okhttp3:okhttp:4.12.0"
```

E garanta Kotlin no módulo (o Capacitor 8 já traz o plugin Kotlin; se não,
adicione `id 'org.jetbrains.kotlin.android'` no topo do `build.gradle` do app e
`ext.kotlin_version = '1.9.24'` no `build.gradle` raiz).

## Ícone da notificação

O serviço usa `R.drawable.ic_stat_notify`. Crie um PNG/vetor branco
monocromático em `android/app/src/main/res/drawable/ic_stat_notify.png`
(ou troque a linha `setSmallIcon` por `android.R.drawable.ic_menu_mylocation`
para testar rápido).

## Depois

```bash
bunx cap sync android
bunx cap open android
```

> Toda mudança nas telas React continua chegando na APK sem recompilar.
> Recompilar só é necessário quando estes arquivos nativos mudarem.
