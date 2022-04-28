var express = require("express");
var history = require("connect-history-api-fallback");

const app = express();
app.use(history());

app.use(express.static("dist"));

// Start server
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`REST server running on port ${port}`);
});
