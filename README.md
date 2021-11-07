# Rethink Chat

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

## Run locally

Create a `.env` file. Use `example.env` as a reference.

```bash
rethinkdb --http-port 5001
node migrate.js
node index.js
npm run build-watch # build app.js, the Vue app
sass --watch public/css:public/css
```
