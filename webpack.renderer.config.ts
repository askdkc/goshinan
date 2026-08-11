import type { Configuration } from "webpack";

export const rendererConfig: Configuration = {
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [{ loader: "ts-loader", options: { transpileOnly: true } }],
      },
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
    ],
  },
  resolve: {
    extensions: [".js", ".ts", ".tsx"],
    // @sabaki/sgf exposes parseFile alongside its browser-safe string parser.
    // The renderer only uses parse/stringify; prevent Webpack from polyfilling
    // or exposing Node's filesystem module.
    fallback: { fs: false },
  },
};
