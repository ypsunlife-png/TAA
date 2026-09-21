const express = require("express");
const { registerRoutes } = require("./routes");

const app = express();
app.use(express.json());

registerRoutes(app);

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`LIAS-SUG API listening on port ${PORT}`);
  });
}

module.exports = app;
