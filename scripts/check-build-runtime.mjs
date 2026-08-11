#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nodeMajor = Number(process.versions.node.split(".")[0]);

if (nodeMajor !== 26) {
  throw new Error(
    `このプロジェクトのパッケージ作成にはNode.js 26.xが必要です。現在のバージョン: ${process.version}`,
  );
}

const yauzlPackagePath = require.resolve("yauzl/package.json");
const yauzlPackage = JSON.parse(await readFile(yauzlPackagePath, "utf8"));

if (yauzlPackage.version !== "3.3.1") {
  throw new Error(
    `Node.js 26でZIP展開が停止しないよう、yauzl 3.3.1が必要です。現在のバージョン: ${yauzlPackage.version}`,
  );
}

console.log(
  `ビルド環境を確認しました: Node.js ${process.versions.node} / yauzl ${yauzlPackage.version}`,
);
