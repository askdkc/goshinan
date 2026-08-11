# 碁指南（Go Shinan）

KataGoをローカルで動かし、対局中の着手を評価するオフライン囲碁指導アプリです。
画面の既定言語とこのREADMEは日本語です。画面右上のボタンで英語表示にも切り替えられます。

Windows x64、macOS Apple Silicon、macOS Intelを対象としています。LinuxはKataGo同梱方法と
配布形式をまだ検証できていないため、現在はサポート対象外です。

詳しいビルド手順、署名、公証、問題の切り分けは[詳細ビルド手順](README.ja.md)を参照してください。

## 必要な環境

- Node.js 26.x（26.5.0で動作確認済み）
- npm 11.x
- Git
- 依存パッケージ、Electron、KataGoモデルを取得できるネットワーク接続
- macOSではHomebrew版KataGo、または自分でビルドしたMetal版KataGo

```sh
node --version
npm --version
npm ci
```

Node.js 24.16以降および26では、Forge 7.11.2が内部利用する古いZIP展開ライブラリにより、
`Copying files`のまま終了しない問題があります。このリポジトリでは`yauzl` 3.3.1を
`package.json`の`overrides`で固定し、ビルド直前にも実際のバージョンを検査します。
Node.js 26.5.0で`package`と`make`が完了することを確認済みです。

依存関係を変更した後は`npm install`ではなく、まず`npm ci`でロックファイルどおりに
入れ直してください。

### WindowsにNode.js 26をインストールする

このプロジェクトで確認済みのNode.js 26.5.0を使用します。Node.js公式の
[Node.js 26.5.0リリースページ](https://nodejs.org/en/blog/release/v26.5.0)から
「Windows 64-bit Installer（`.msi`）」をダウンロードしてください。インストーラーでは
既定の構成を使用し、npmとPATHへの追加を有効なままにします。

コマンドで導入する場合は、管理者権限のPowerShellまたはWindows Terminalで実行します。

```powershell
winget install --id OpenJS.NodeJS --exact --version 26.5.0
```
nodeによるスクリプト実行が弾かれることがあるのでPowerShellを管理者として実行して、次のスクリプトでnodeを許可してください。

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

インストール後は開いているターミナルをすべて閉じ、新しいPowerShellを開いて確認します。

```powershell
node --version
npm --version
where.exe node
```

`node --version`が`v26.5.0`、`where.exe node`が通常
`C:\Program Files\nodejs\node.exe`を示せば準備完了です。`node`が見つからない場合は
Windowsへサインインし直すか再起動してください。別のバージョンが表示される場合は、
`where.exe node`に複数のパスが出ていないか確認し、古いNode.jsまたは別のバージョン管理
ツールが先に読まれないようPATHを整理してから`npm ci`を実行します。

`winget`で26.5.0が見つからない場合は、上記の公式MSIを使用してください。

## KataGoリソースの準備

KataGo実行ファイルとモデルはGitに含めません。次のコマンドで取得・検証・配置します。

### macOS Apple Silicon

```sh
brew install katago
npm run resources:fetch -- --platform=darwin --arch=arm64
```

`resources:fetch`はPATH上の`katago`を探します。見つからない場合は
`brew install katago`を案内して終了します。任意のバイナリを使う場合は絶対パスを指定します。

```sh
npm run resources:fetch -- --platform=darwin --arch=arm64 \
  --katago-binary=/absolute/path/to/katago
```

Intel Macでは`--arch=x64`を指定し、x64コードを含むKataGoを用意してください。

### Windows x64

```powershell
npm i
npm run resources:fetch -- --platform=win32 --arch=x64
```

Windowsでは公式OpenCL版KataGoと必要なDLLも自動取得します。

取得物、モデル、キャッシュ、一時ファイルは`.gitignore`の対象です。通常解析モデルと
Human SLモデルの合計は約200 MBで、キャッシュを含めると約400 MBを使用します。

## 開発と検証

```sh
npm run typecheck
npm run lint
npm test
npm run format:check
npm start
```

KataGoリソースがなくてもアプリは「素材不足」状態で起動し、盤面操作とSGF入出力は利用できます。
対局相手、解析、指導機能にはKataGoリソースが必要です。

## 配布物の作成

`make`は内部で`package`も実行します。通常は`make`だけを実行してください。

### macOS Apple Silicon

```sh
npm run make -- --platform=darwin --arch=arm64
```

成果物:

```text
out/Go Shinan-darwin-arm64/Go Shinan.app
out/make/zip/darwin/arm64/
```

### macOS Intel

```sh
npm run make -- --platform=darwin --arch=x64
```

### Windows x64

Windows上で実行します。`package.json`には配布者本人または組織の`author`も設定してください。

```powershell
npm run make -- --platform=win32 --arch=x64
```

成果物は`out/make/`以下のSquirrel `Setup.exe`、`.nupkg`、`RELEASES`です。

通常、キャッシュ済みのmacOSビルドは数十秒程度です。ネットワークや初回ダウンロードで
数分かかることはありますが、`Copying files`のまま5分以上進まないのは正常ではありません。
その場合は中断し、次を確認してください。

```sh
node --version
npm ls yauzl
```

期待値はNode.js 26.xと`yauzl@3.3.1 overridden`です。

## 配布前の注意

現在の設定ではmacOSのDeveloper ID署名・公証、およびWindowsコード署名を行いません。
一般配布前に署名設定と第三者ライセンス表記を完成させ、対象OSの実機でテストしてください。

## 関連資料

- [Electron Forge issue #4277: Node.js 24.16/26でpackageが終了しない問題](https://github.com/electron/forge/issues/4277)
- [Electron issue #51619: 古いZIP展開処理の問題](https://github.com/electron/electron/issues/51619)
- [KataGoリソースの詳細](resources/katago/README.md)
- [ライセンス](LICENSE)
