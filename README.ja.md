# Go Shinan（碁指南）

[English README](README.md)

Go Shinan は、ローカルの KataGo を使って着手を評価する、オフラインの
Electron デスクトップ囲碁コーチです。この文書では Windows と macOS 向けの
開発ビルドと配布物の作成方法を説明します。

## 最初に確認すること

このリポジトリの現状は次のとおりです。

- Windows x64、macOS arm64、macOS x64 はアプリ側の対象として定義済みです。
- `forge.config.ts` に設定済みの配布形式は、Windows の Squirrel
  インストーラーと macOS の ZIP です。
- Linux は現在サポート対象外です。Linux 用 KataGo リソース定義、エンジンの
  platform key、deb/RPM maker、実機テストがないため、本書では Linux の
  ビルド手順を扱いません。
- KataGo 実行ファイルとニューラルネットワークはリポジトリに含まれません。
  それらを追加しない場合もアプリは起動しますが、`Assets missing` と表示され、
  KataGo 対局・解析・コーチングは動作しません。
- 現在の署名・公証設定は開発用です。そのままの成果物を一般配布しないでください。

Electron Forge は、原則として実行中の OS と CPU 向けにビルドします。異なる OS
へのクロスビルドには制約が多いため、Windows と macOS のネイティブ CI ジョブを
分けるのが安全です。

## 共通要件

- Git
- Node.js 22.12 以上
- npm 10 以上を推奨
- KataGo バイナリ
- 通常解析用 KataGo モデル
- Human SL モデル `b18c384nbt-humanv0.bin.gz`
- Electron、Forge の補助ファイルを取得するためのビルド時ネットワーク接続

バージョンを確認します。

```sh
node --version
npm --version
```

このプロジェクトは Node.js 18 ではビルドしません。macOS 上で Homebrew の
Node.js 22 を明示的に使う場合は、各コマンドの前に次を付けます。

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm ci
```

通常の環境では次で依存関係を再現できます。

```sh
npm ci
```

## KataGo リソースの準備

### 自動ダウンロードについて

現在は KataGo バイナリとモデルを自動ダウンロードしません。`npm ci`、
`npm install`、`npm start`、アプリの初回起動のいずれもリソースを取得しません。
リソースがない場合、アプリは `Assets missing` 状態で起動します。

将来、自動化する場合は `postinstall` や初回起動時に暗黙で取得するのではなく、
次のような明示的なビルド用コマンドを追加する方針です。ただし、このコマンドは
現時点では未実装です。

```sh
npm run resources:fetch -- --platform=darwin --arch=arm64
npm run resources:fetch -- --platform=win32 --arch=x64
```

取得処理には、固定 URL、アーカイブと展開後ファイルの SHA-256 検証、キャッシュ、
実行権限の設定、ライセンス文書の保存が必要です。macOS 用 KataGo は公式リリースに
プリコンパイル済みバイナリがない場合があるため、CI でビルドした固定 artifact を
管理する必要があります。

ダウンロードしたバイナリ、モデル、アーカイブ、キャッシュ、一時ファイルは
`.gitignore` の対象です。`manifest.json`、設定ファイル、チェックサム、ライセンス
情報だけを Git で管理します。

`resources/katago/manifest.json` に記載された場所へ、対象 OS・CPU 用のファイルを
配置します。モデルはプラットフォーム間で共用できます。

```text
resources/katago/
├── bin/
│   ├── darwin-arm64/katago
│   ├── darwin-x64/katago
│   └── win32-x64/katago.exe
├── config/analysis.cfg
├── models/
│   ├── normal.bin.gz
│   └── b18c384nbt-humanv0.bin.gz
└── manifest.json
```

macOS では、KataGo バイナリに実行権限を付けます。

```sh
chmod +x resources/katago/bin/darwin-arm64/katago
chmod +x resources/katago/bin/darwin-x64/katago
```

全ファイルの SHA-256 を計算し、`manifest.json` の
`REPLACE_WITH_SHA256` を実値へ置き換えてください。macOS の例:

```sh
shasum -a 256 resources/katago/bin/darwin-arm64/katago
shasum -a 256 resources/katago/models/normal.bin.gz
shasum -a 256 resources/katago/models/b18c384nbt-humanv0.bin.gz
shasum -a 256 resources/katago/config/analysis.cfg
```

Windows PowerShell の例:

```powershell
Get-FileHash -Algorithm SHA256 resources\katago\bin\win32-x64\katago.exe
Get-FileHash -Algorithm SHA256 resources\katago\models\normal.bin.gz
Get-FileHash -Algorithm SHA256 resources\katago\models\b18c384nbt-humanv0.bin.gz
Get-FileHash -Algorithm SHA256 resources\katago\config\analysis.cfg
```

`manifest.json` の `kataGoVersion` も、実際に検証した KataGo のバージョンへ
変更します。チェックサムが未設定または不一致の場合、アプリは意図的に KataGo を
起動しません。

配布前に、KataGo と各モデルのライセンス・取得元・正確なバージョンを
`THIRD_PARTY_NOTICES` へ追加してください。

## ビルド前の共通検証

配布物を作る前に、次をすべて通します。

```sh
npm run typecheck
npm run lint
npm test
npm run format:check
npm audit
```

開発モードで起動する場合:

```sh
npm start
```

Forge の `package` は実行可能なアプリディレクトリを `out/` に作り、`make` は
maker を使って ZIP や EXE などの配布物を `out/make/` に作ります。

## Windows x64

### 要件

- 64-bit Windows
- Node.js 22.12 以上
- Squirrel.Windows 用のパッケージメタデータ
- 一般配布する場合は Windows コード署名環境

Squirrel.Windows は `author` と `description` を必要とします。現在の
`package.json` には `description` はありますが `author` はありません。実際の
権利者を設定してください。架空の値で配布してはいけません。

```json
{
  "author": "実際の個人名または組織名"
}
```

### アプリディレクトリだけを作る

PowerShell またはコマンドプロンプトで実行します。

```powershell
npm ci
npm run package -- --platform=win32 --arch=x64
```

成果物:

```text
out/Go Shinan-win32-x64/
```

### Squirrel.Windows インストーラーを作る

```powershell
npm run make -- --platform=win32 --arch=x64
```

成功すると、`out/make/` 以下に主に次が生成されます。

- `Go Shinan Setup.exe`
- `.nupkg`
- `RELEASES`

`electron-squirrel-startup` の処理はすでに main process の先頭へ組み込み済みです。

### Windows 署名

未署名 EXE は SmartScreen の警告対象になります。一般配布では Authenticode
証明書または利用可能なクラウド署名サービスを設定してください。秘密鍵、PFX
パスワード、Azure 資格情報を Git にコミットしてはいけません。

Squirrel maker を macOS 上で作ることは公式にはサポートされません。Windows
ネイティブ環境を使ってください。

## macOS

macOS は Apple Silicon `arm64` と Intel `x64` を別々に作ります。現在は universal
binary を生成する設定ではありません。

### 要件

- macOS
- Node.js 22.12 以上
- Xcode Command Line Tools
- 一般配布する場合は Apple Developer Program の証明書と公証資格情報

Command Line Tools を確認します。

```sh
xcode-select -p
```

### Apple Silicon arm64

```sh
npm ci
npm run package -- --platform=darwin --arch=arm64
npm run make -- --platform=darwin --arch=arm64
```

### Intel x64

```sh
npm ci
npm run package -- --platform=darwin --arch=x64
npm run make -- --platform=darwin --arch=x64
```

現在の maker は macOS 用 ZIP を生成します。成果物は次です。

```text
out/Go Shinan-darwin-arm64/Go Shinan.app
out/Go Shinan-darwin-x64/Go Shinan.app
out/make/zip/darwin/arm64/
out/make/zip/darwin/x64/
```

### macOS 署名と公証

現在の `forge.config.ts` には `osxSign` と `osxNotarize` がないため、一般配布用の
署名・公証は行われません。macOS 10.15 以降で通常の利用者へ配布する場合は、
Developer ID Application 署名と Apple の公証を設定してください。

資格情報は環境変数または macOS Keychain profile から読み込ませます。Apple ID、
app-specific password、API private key をソースへ直書きしないでください。

## 推奨 CI 構成

一台の開発機から両 OS を無理にクロスビルドせず、次の matrix を使います。

| Runner      | Target         | 主な成果物              |
| ----------- | -------------- | ----------------------- |
| Windows x64 | `win32-x64`    | Squirrel `Setup.exe`    |
| macOS arm64 | `darwin-arm64` | `.app`、ZIP、署名・公証 |
| macOS x64   | `darwin-x64`   | `.app`、ZIP、署名・公証 |

各ジョブで、対象プラットフォームの KataGo バイナリを安全な artifact storage から
取得し、既知の SHA-256 と照合してから `npm run make` を実行してください。署名鍵や
公証資格情報は CI の secret store に置きます。

## よくある失敗

### `Assets missing`

KataGo またはモデルが未配置、`manifest.json` が未更新、対象 platform key がない、
あるいは SHA-256 が不一致です。UI が起動しただけでは KataGo の検証成功を意味しません。

### `Checksum mismatch`

チェックサムを計算したファイルと、実際に配置したファイルが異なります。ファイルを
差し替えるたびに `manifest.json` も更新してください。

### `Permission denied`（macOS）

KataGo バイナリの実行権限を確認します。

```sh
ls -l resources/katago/bin/<target>/katago
chmod +x resources/katago/bin/<target>/katago
```

### Squirrel が metadata を要求する

`package.json` の `author` が未設定です。実際の権利者を設定してください。

### `getaddrinfo ENOTFOUND github.com`

Electron または Forge のビルド補助ファイルを取得できていません。ビルド環境の DNS、
proxy、firewall、GitHub への接続を確認してください。

### macOS で「開発元を確認できない」

開発ビルドが未署名・未公証です。利用者へ Gatekeeper を無効化させるのではなく、
署名と公証を設定してください。

### Windows SmartScreen の警告

未署名または署名 reputation が不足しています。一般配布では Windows コード署名を
設定してください。

## 参考資料

- [Electron Forge: Build Lifecycle](https://www.electronforge.io/core-concepts/build-lifecycle)
- [Electron Forge: Configuration](https://www.electronforge.io/config/configuration)
- [Electron Forge: Makers](https://www.electronforge.io/config/makers)
- [Squirrel.Windows maker](https://www.electronforge.io/config/makers/squirrel.windows)
- [ZIP maker](https://www.electronforge.io/config/makers/zip)
- [macOS code signing and notarization](https://www.electronforge.io/guides/code-signing/code-signing-macos)
- [Windows code signing](https://www.electronforge.io/guides/code-signing/code-signing-windows)
