const path = require("path");
const webpack = require("webpack");
const dotenv = require("dotenv");
const CopyPlugin = require("copy-webpack-plugin");
const RemoveEmptyScriptsPlugin = require("webpack-remove-empty-scripts");

module.exports = {
    entry: ["./src/app.js", "./src/scss/main.scss"],
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "bundle.js",
    },
    resolve: {
        fallback: {
            querystring: require.resolve("querystring-es3"),
        },
    },
    module: {
        rules: [
            {
                test: /\.scss$/,
                exclude: /node_modules/,

                type: "asset/resource",
                generator: {
                    filename: "css/[name].css",
                },

                use: ["sass-loader"],
            },
        ],
    },
    plugins: [
        new webpack.DefinePlugin({
            "process.env": JSON.stringify(dotenv.config().parsed),
        }),
        new CopyPlugin({
            patterns: [{ from: "public", to: "." }],
        }),
        new RemoveEmptyScriptsPlugin(),
    ],
};
