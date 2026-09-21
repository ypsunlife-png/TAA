function errorResponse(code, message, details = {}) {
  return {
    ok: false,
    error: { code, message, details },
    traceId: "dev-trace-id",
    timestamp: new Date().toISOString()
  };
}

function registerRoutes(app) {
  app.post("/decision-gates/evaluate", (req, res) => {
    return res.status(200).json({
      ok: true,
      decision: "ALLOW",
      reasons: []
    });
  });

  app.post("/risk/pretrade-check", (req, res) => {
    return res.status(200).json({
      ok: true,
      passed: true,
      violations: []
    });
  });

  app.post("/triggers/simulate", (req, res) => {
    return res.status(200).json({
      ok: true,
      triggered: false,
      events: []
    });
  });

  app.post("/execution/orders", (req, res) => {
    const { clientOrderId } = req.body || {};
    if (!clientOrderId) {
      return res
        .status(400)
        .json(errorResponse("MISSING_REQUIRED_FIELD", "clientOrderId is required"));
    }

    return res.status(200).json({
      ok: true,
      orderId: `ord_${Date.now()}`,
      status: "ACCEPTED"
    });
  });
}

module.exports = { registerRoutes, errorResponse };
