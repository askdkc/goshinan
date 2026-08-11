import type { ForgeConfig } from "@electron-forge/shared-types";
import path from "node:path";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { WebpackPlugin } from "@electron-forge/plugin-webpack";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { mainConfig } from "./webpack.main.config";
import { rendererConfig } from "./webpack.renderer.config";
import { resolveAndVerifyResources } from "./src/main/engine/resources";

const kataGoResourceRoot = path.resolve(__dirname, "resources", "katago");

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    extraResource: ["./resources/katago", "./THIRD_PARTY_NOTICES"],
    appBundleId: "com.goshinan.desktop",
    appCategoryType: "public.app-category.games",
    extendInfo: {
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: false,
        NSAllowsLocalNetworking: false,
      },
    },
  },
  rebuildConfig: {},
  hooks: {
    prePackage: async (_forgeConfig, platform, arch) => {
      try {
        await resolveAndVerifyResources(kataGoResourceRoot, platform, arch);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          `${platform}-${arch}用KataGoリソースの検証に失敗しました: ${detail}\n` +
            `先に npm run resources:fetch -- --platform=${platform} --arch=${arch} を実行してください。`,
          { cause: error },
        );
      }
    },
  },
  makers: [
    new MakerSquirrel({ name: "GoShinan" }),
    new MakerZIP({}, ["darwin"]),
  ],
  plugins: [
    new WebpackPlugin({
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: "./src/index.html",
            js: "./src/renderer.tsx",
            name: "main_window",
            preload: { js: "./src/preload.ts" },
          },
        ],
      },
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
