# KataGoリソース

このディレクトリはElectronの`extraResources`として、`app.asar`の外側へコピーされます。
実行ファイル、動的ライブラリ、モデル、ダウンロード、一時キャッシュはローカルで生成し、
Gitには登録しません。

対象環境のリソースは次のコマンドで準備します。

```sh
npm run resources:fetch -- --platform=darwin --arch=arm64
npm run resources:fetch -- --platform=darwin --arch=x64
npm run resources:fetch -- --platform=win32 --arch=x64
```

このコマンドは、取得した各ファイルを`sources.json`に固定したファイルサイズと
SHA-256で検証し、所定の場所へ配置して`manifest.json`を更新します。最後にKataGoの
analysis engineを起動し、通常モデルとHuman SLモデルの両方が読み込めることを確認します。

検証済みのダウンロードはプロジェクト直下の`.cache/katago`で再利用します。このキャッシュは
アプリへ同梱される`extraResources`には入りません。

## 対応対象

- `darwin-arm64`: Apple Silicon用のMetal版KataGo。`brew install katago`で
  インストールするか、`--katago-binary`で実行ファイルを指定します。
- `darwin-x64`: Intel用のMetal版KataGo。実行ファイルにx64コードが必要です。
- `win32-x64`: 固定バージョンのKataGo 1.17.1公式OpenCLアーカイブと必要なDLL。

## 必要なモデル

- 通常の高棋力解析に使用する、検証済みのKataGoモデル。
- `rank_1d`から`rank_9d`までのHuman SL方策に使用する
  `b18c384nbt-humanv0.bin.gz`。

## macOSでKataGoが見つからない場合

`resources:fetch`はPATH上の`katago`を探します。見つからなければ、次を実行してください。

```sh
brew install katago
npm run resources:fetch -- --platform=darwin --arch=arm64
```

別のMetal版KataGoを使う場合:

```sh
npm run resources:fetch -- --platform=darwin --arch=arm64 \
  --katago-binary=/absolute/path/to/katago
```

macOS用の処理では、Homebrew由来の非システムdylibもコピーし、Mach-Oの参照先を
書き換えたうえでアドホック署名します。これはローカル動作確認用であり、最終アプリに必要な
Developer ID署名とApple公証の代わりにはなりません。

配布前に`THIRD_PARTY_NOTICES`を完成させ、3対象すべてで実エンジンの動作確認を行い、
インストーラーの署名とmacOSアプリの公証を実施してください。
