const dotenv = require("dotenv");
const path = require("path");
const webpack = require("webpack");
const CopyPlugin = require("copy-webpack-plugin");
const RemoveEmptyScriptsPlugin = require("webpack-remove-empty-scripts");

// this will update the process.env with environment variables in .env file
dotenv.config();

module.exports = {
    mode: "development",
    devServer: {
        historyApiFallback: true,
        static: {
            directory: path.join(__dirname, "dist"),
        },
        compress: true,
        port: 8080,
    },
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
        new CopyPlugin({
            patterns: [{ from: "public", to: "." }],
        }),
        new RemoveEmptyScriptsPlugin(),
        new webpack.DefinePlugin({
            "process.env.VUE_APP_APP_ID": JSON.stringify(process.env.VUE_APP_APP_ID),
        }),
    ],
};
