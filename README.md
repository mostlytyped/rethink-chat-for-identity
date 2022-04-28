# Rethink Chat

## Run locally

Add your RethinkID app ID in `rethinkid/index.js`.

```bash
npm install
```

```bash
npm run serve # start the Express server static files
npm run build-watch # use Webpack to build app.js, the Vue app
npm run build # use Webpack to build for prod

# Optional
sass --watch public/css:public/css
```
