# Rethink Chat

## Run locally

Add your RethinkID app ID in `rethinkid/index.js`.

Install npm modules. The `@mostlytyped/rethinkid-js-sdk` is hosted as a private GitHub package and requires [authentication](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-to-github-packages).

```bash
npm install
```

```bash
npm run serve # start the Express server static files
npm run build-watch # use Webpack to build app.js, the Vue app

# Optional
sass --watch public/css:public/css
```
