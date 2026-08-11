# Go Shinan（碁指南）

[概要と最短手順](README.md)

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
  それらを追加しない場合もアプリは起動しますが、「素材不足」と表示され、
  KataGo 対局・解析・コーチングは動作しません。
- 現在の署名・公証設定は開発用です。そのままの成果物を一般配布しないでください。

Electron Forge は、原則として実行中の OS と CPU 向けにビルドします。異なる OS
へのクロスビルドには制約が多いため、Windows と macOS のネイティブ CI ジョブを
分けるのが安全です。

## 共通要件

- Git
- Node.js 26.x（26.5.0で動作確認済み）
- npm 11.x
- macOS の場合は Homebrew 版 KataGo、または自分でビルドした Metal 版 KataGo
- KataGo モデル、Electron、Forge の補助ファイルを取得するためのビルド時ネットワーク接続

バージョンを確認します。

```sh
node --version
npm --version
```

このプロジェクトのパッケージ作成はNode.js 26.xに固定しています。依存関係は次で
ロックファイルどおりに再現します。

```sh
npm ci
```

Node.js 24.16以降および26では、Forge 7.11.2が内部利用する`extract-zip`の
`yauzl` 2.10.0により、パッケージ処理が`Copying files`のまま終了しない問題があります。
このリポジトリでは`package.json`の`overrides`で`yauzl` 3.3.1へ固定しています。
さらに`prepackage`と`premake`でNode.jsと`yauzl`の実バージョンを検査し、古い依存関係へ
戻った場合は無限に待たず日本語のエラーで停止します。

```sh
npm ls yauzl
```

`yauzl@3.3.1 overridden`と表示されることを確認してください。

## KataGo リソースの準備

### 自動ダウンロードについて

`resources:fetch` を実装済みです。対象プラットフォームを明示して実行します。

```sh
npm run resources:fetch -- --platform=darwin --arch=arm64
npm run resources:fetch -- --platform=darwin --arch=x64
npm run resources:fetch -- --platform=win32 --arch=x64
```

このコマンドは次を行います。

- 通常解析モデルと Human SL モデルを固定URLから取得し、ファイルサイズと
  SHA-256を照合する
- Windows x64では、KataGo 1.17.1公式OpenCL ZIPを取得・検証し、実行ファイルと
  必須DLLを展開する
- macOSでは、ローカルのMetal版KataGoと非システムdylibを同梱用ディレクトリへ
  コピーし、Mach-Oの参照先を書き換える
- 実行ファイル、モデル、設定、依存ライブラリのSHA-256を`manifest.json`へ書き込む
- 完成したanalysis engineを実際に起動し、通常モデルとHuman SLモデルの両方が
  読み込めることを確認する

モデルは合計約200 MBです。検証済みファイルを`.cache/katago/`へ保存する
ため、2回目以降は再ダウンロードしません。キャッシュと配置済みモデルを合わせて
約400 MBのディスク容量を使います。

`npm ci`、`npm install`、`npm start`、アプリの初回起動からは暗黙に実行しません。
大容量ダウンロードとネイティブファイルの変更を依存関係インストールの副作用に
しないためです。リソースがない場合、アプリは「素材不足」状態で起動します。

### macOSでのKataGo準備

KataGo公式GitHub ReleaseにはmacOS用プリコンパイル済み実行ファイルがないため、
`resources:fetch`はPATH上のローカルKataGoを使用します。通常は先に実行します。

```sh
brew install katago
npm run resources:fetch -- --platform=darwin --arch=arm64
```

別のMetal版バイナリを使う場合:

```sh
npm run resources:fetch -- --platform=darwin --arch=arm64 \
  --katago-binary=/absolute/path/to/katago
```

指定したCPUアーキテクチャがバイナリに含まれない場合、KataGo 1.15.0未満の場合、
またはdylibを安全に解決できない場合は処理を中止します。Apple Silicon上でIntel
x64リソースを作る場合は、x64版KataGoを`--katago-binary`で指定してください。

### WindowsでのKataGo準備

Windows x64では追加のKataGoインストールは不要です。次のコマンドが公式OpenCL版
KataGo、必須DLL、両モデルを取得します。

```powershell
npm run resources:fetch -- --platform=win32 --arch=x64
```

ダウンロードしたバイナリ、モデル、アーカイブ、キャッシュ、一時ファイルは
`.gitignore` の対象です。`manifest.json`、設定ファイル、チェックサム、ライセンス
情報だけを Git で管理します。

出力先は次のとおりです。モデルはプラットフォーム間で共用します。

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
├── manifest.json
└── sources.json
```

URL、期待サイズ、取得元SHA-256は`resources/katago/sources.json`に固定しています。
値を変更する場合は、配布元とライセンスを再確認し、実ファイルを別経路でも検証して
ください。チェックサムが未設定または不一致の場合、アプリは意図的にKataGoを
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

### Node.js 26のインストール

Node.js公式の[Node.js 26.5.0リリースページ](https://nodejs.org/en/blog/release/v26.5.0)
から「Windows 64-bit Installer（`.msi`）」をダウンロードして実行します。
インストーラーでは既定の構成を使用し、npmとPATHへの追加を無効にしないでください。

`winget`を使用する場合は、管理者権限のPowerShellまたはWindows Terminalで実行します。

```powershell
winget install --id OpenJS.NodeJS --exact --version 26.5.0
```

導入後は開いているターミナルをすべて閉じ、新しいPowerShellで確認します。

```powershell
node --version
npm --version
where.exe node
```

期待値はNode.js `v26.5.0`とnpm 11.xです。`where.exe node`は通常
`C:\Program Files\nodejs\node.exe`を表示します。

`node`が見つからない場合は、Windowsへサインインし直すか再起動してPATHを反映します。
Node.js 22や24など別のバージョンが表示される場合は、`where.exe node`に出た各パスを
確認してください。古いNode.js、nvm-windows、Voltaなどが先に読まれている状態では、
Node.js 26をインストールしただけでは使用バージョンが切り替わりません。

`winget`で26.5.0が見つからない場合は、公式リリースページのMSIを使用してください。

### 要件

- 64-bit Windows
- Node.js 26.x
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
npm run resources:fetch -- --platform=win32 --arch=x64
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
- Node.js 26.x
- Xcode Command Line Tools
- 一般配布する場合は Apple Developer Program の証明書と公証資格情報

Command Line Tools を確認します。

```sh
xcode-select -p
```

### Apple Silicon arm64

```sh
npm ci
brew install katago
npm run resources:fetch -- --platform=darwin --arch=arm64
npm run make -- --platform=darwin --arch=arm64
```

### Intel x64

```sh
npm ci
brew install katago
npm run resources:fetch -- --platform=darwin --arch=x64
npm run make -- --platform=darwin --arch=x64
```

`make`は内部で`package`を実行するため、両方を続けて実行する必要はありません。

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

各ジョブで`resources:fetch`を実行してから`npm run make`を実行します。macOSの
再現可能なリリースではHomebrewの最新版へ無条件に追従せず、検証したKataGo
バージョンのCI artifactまたは`--katago-binary`を使って入力を固定してください。
署名鍵や公証資格情報はCIのsecret storeに置きます。

## よくある失敗

### 「素材不足」

KataGo またはモデルが未配置、`manifest.json` が未更新、対象 platform key がない、
あるいは SHA-256 が不一致です。対象OS上で`resources:fetch`を再実行してください。

### 「KataGoがPATH上に見つかりません」（macOS）

`brew install katago`を実行するか、検証済みMetal版KataGoの絶対パスを
`--katago-binary`で指定してください。Intel x64用を作る場合はx64コードを含む
バイナリが必要です。

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

### `Copying files`のまま5分以上終了しない

Node.js 24.16以降または26と古い`yauzl` 2.10.0の組み合わせによる既知の問題です。
このリポジトリの`package.json`と`package-lock.json`を使用して`npm ci`をやり直し、
次の期待値を確認してください。

```sh
node --version
npm ls yauzl
```

Node.js 26.x、`yauzl@3.3.1 overridden`であれば、ビルド前検査を通過します。
手元で変更した`overrides`を削除したり、`package-lock.json`を古い状態へ戻したりしないでください。

### macOS で「開発元を確認できない」

開発ビルドが未署名・未公証です。利用者へ Gatekeeper を無効化させるのではなく、
署名と公証を設定してください。

### Windows SmartScreen の警告

未署名または署名 reputation が不足しています。一般配布では Windows コード署名を
設定してください。

## 参考資料

- [Electron Forge: Build Lifecycle](https://www.electronforge.io/core-concepts/build-lifecycle)
- [Electron Forge issue #4277: Node.js 24.16/26でpackageが終了しない問題](https://github.com/electron/forge/issues/4277)
- [Electron Forge: Configuration](https://www.electronforge.io/config/configuration)
- [Electron Forge: Makers](https://www.electronforge.io/config/makers)
- [Squirrel.Windows maker](https://www.electronforge.io/config/makers/squirrel.windows)
- [ZIP maker](https://www.electronforge.io/config/makers/zip)
- [macOS code signing and notarization](https://www.electronforge.io/guides/code-signing/code-signing-macos)
- [Windows code signing](https://www.electronforge.io/guides/code-signing/code-signing-windows)
