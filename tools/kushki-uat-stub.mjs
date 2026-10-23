// Local stand-in for Kushki's UAT API, for verifying our integration end to end
// without a real Kushki account. It speaks the documented contract:
//
//   GET    /kushki.min.js            → a drop-in Kushki.js that mints card tokens
//   POST   /card/v1/charges          → token charge (Private-Merchant-Id header)
//   DELETE /card/v1/charges/:ticket  → full/partial refund or void
//
// Point the API at it with KUSHKI_BASE_URL=http://localhost:4100 and the booking
// engine at it with VITE_KUSHKI_SDK_URL=http://localhost:4100/kushki.min.js.
// It is NOT Kushki — it only proves our request/response shapes line up.
//
// Conventions for deterministic tests:
//   - card number 4574441215190335 → token request declined ((017) Invalid card)
//   - a charge token beginning "decline" → charge declined at the gateway
//   - a refund ticket equal to "FAIL" → refund declined
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.KUSHKI_STUB_PORT ?? 4100);
const log = (...a) => console.log(new Date().toISOString(), ...a);

const SDK_JS = `/* Kushki.js UAT stub — mints a fake single-use card token client-side. */
(function () {
  function Kushki(opts) { this.opts = opts || {}; }
  Kushki.prototype.requestToken = function (payload, cb) {
    var card = (payload && payload.card) || {};
    var num = String(card.number || "").replace(/\\s/g, "");
    if (num === "4574441215190335") {
      cb({ code: "017", message: "Invalid card",
           error: { details: ["(017) Invalid card"] } });
      return;
    }
    cb({ token: "stubtok-" + num.slice(-4) + "-" + Date.now() });
  };
  window.Kushki = Kushki;
})();`;

function send(res, status, body, type = "application/json") {
  const payload = type === "application/json" ? JSON.stringify(body) : body;
  res.writeHead(status, {
    "content-type": type,
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (req.method === "OPTIONS") return send(res, 204, "");

  if (req.method === "GET" && path === "/kushki.min.js") {
    log("GET /kushki.min.js (SDK served)");
    return send(res, 200, SDK_JS, "application/javascript");
  }

  if (req.method === "POST" && path === "/card/v1/charges") {
    const merchant = req.headers["private-merchant-id"];
    const body = await readBody(req);
    log("POST /card/v1/charges", {
      merchant: merchant ? "present" : "MISSING",
      token: body.token,
      amount: body.amount,
      clientTxId: body.metadata?.clientTxId,
    });
    if (!merchant) {
      return send(res, 401, { code: "K001", message: "Missing Private-Merchant-Id" });
    }
    if (!body.token || String(body.token).startsWith("decline")) {
      return send(res, 402, { code: "K021", message: "(021) Insufficient funds" });
    }
    const ticketNumber = "TCK-" + randomUUID().slice(0, 12);
    const transactionReference = randomUUID();
    return send(res, 200, {
      ticketNumber,
      transactionReference,
      transactionStatus: "APPROVAL",
      details: { approvalCode: "000000", binCard: "424242" },
    });
  }

  const refundMatch = path.match(/^\/card\/v1\/charges\/(.+)$/);
  if (req.method === "DELETE" && refundMatch) {
    const ticket = decodeURIComponent(refundMatch[1]);
    const merchant = req.headers["private-merchant-id"];
    const body = await readBody(req);
    log("DELETE /card/v1/charges/:ticket", {
      ticket,
      merchant: merchant ? "present" : "MISSING",
      amount: body.amount,
    });
    if (!merchant) {
      return send(res, 401, { code: "K001", message: "Missing Private-Merchant-Id" });
    }
    if (ticket === "FAIL") {
      return send(res, 422, { code: "K104", message: "Refund could not be processed" });
    }
    return send(res, 200, {
      ticketNumber: ticket,
      transactionReference: randomUUID(),
      message: "Refund request accepted",
    });
  }

  log(req.method, path, "→ 404");
  return send(res, 404, { message: "Not found" });
});

server.listen(PORT, () => log(`Kushki UAT stub listening on http://localhost:${PORT}`));
