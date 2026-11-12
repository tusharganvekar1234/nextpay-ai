
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";

import { analyzePurchase } from "./ai.js";
import { createOrder, captureOrder } from "./paypal.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const purchaseSessions = new Map();
const orderSessions = new Map();

// Persistent transaction storage
const dataDirectory = path.join(__dirname, "data");
const transactionsFile = path.join(dataDirectory, "transactions.json");

let transactions = [];

async function loadTransactions() {
  await mkdir(dataDirectory, { recursive: true });

  try {
    const contents = await readFile(transactionsFile, "utf8");
    const parsed = JSON.parse(contents);

    transactions = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Could not read transaction store:", error.message);
      throw error;
    }

    transactions = [];
    await writeFile(transactionsFile, "[]\n", "utf8");
  }
}

async function saveTransactions() {
  await mkdir(dataDirectory, { recursive: true });

  const temporaryFile = `${transactionsFile}.tmp`;

  await writeFile(
    temporaryFile,
    `${JSON.stringify(transactions, null, 2)}\n`,
    "utf8"
  );

  await rename(temporaryFile, transactionsFile);
}

function cleanExpiredSessions() {
  const expiry = 30 * 60 * 1000;
  const now = Date.now();

  for (const [id, session] of purchaseSessions) {
    if (now - session.createdAt > expiry) {
      purchaseSessions.delete(id);
    }
  }

  for (const [id, session] of orderSessions) {
    if (now - session.createdAt > expiry) {
      orderSessions.delete(id);
    }
  }
}

function sendError(res, error, status = 400) {
  console.error("API error:", error.message);

  return res.status(status).json({
    success: false,
    message: error.message || "Something went wrong."
  });
}

app.use(cors({
  origin: [
    FRONTEND_URL,
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "10kb" }));

// HEALTH CHECK
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    name: "NEXTPAY AI",
    status: "running",
    services: {
      groq: Boolean(process.env.GROQ_API_KEY),
      paypal: Boolean(
        process.env.PAYPAL_CLIENT_ID &&
        process.env.PAYPAL_CLIENT_SECRET
      ),
      environment: "sandbox",
      transactionStorage: "file"
    }
  });
});

// GET PERSISTED TRANSACTION HISTORY
app.get("/api/transactions", (req, res) => {
  res.json({
    success: true,
    count: transactions.length,
    transactions: [...transactions].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
    )
  });
});

// ANALYZE PURCHASE
app.post("/api/analyze", async (req, res) => {
  try {
    cleanExpiredSessions();

    const { request, budget } = req.body;

    if (
      typeof request !== "string" ||
      request.trim().length < 5 ||
      request.length > 2000
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter a purchase description between 5 and 2000 characters."
      });
    }

    const analysis = await analyzePurchase(request, budget);
    const analysisId = randomUUID();

    purchaseSessions.set(analysisId, {
      analysis,
      request: request.trim(),
      createdAt: Date.now(),
      orderId: null,
      captured: false
    });

    return res.json({
      success: true,
      analysisId,
      analysis
    });

  } catch (error) {
    return sendError(res, error);
  }
});

// CREATE PAYPAL ORDER
app.post("/api/paypal/create-order", async (req, res) => {
  try {
    cleanExpiredSessions();

    const { analysisId } = req.body;
    const session = purchaseSessions.get(analysisId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Purchase session expired. Please analyze again."
      });
    }

    if (session.orderId) {
      return res.status(409).json({
        success: false,
        message: "An order already exists for this purchase."
      });
    }

    const analysis = session.analysis;

    if (!analysis.checks.budget || !analysis.budget_check.passed) {
      return res.status(403).json({
        success: false,
        message: "Purchase blocked: spending limit exceeded."
      });
    }

    if (analysis.risk_level === "HIGH") {
      return res.status(403).json({
        success: false,
        message: "Purchase blocked: high-risk request."
      });
    }

    if (!analysis.exact_amount || analysis.exact_amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "An exact purchase amount is required before checkout."
      });
    }

    if (analysis.exact_amount > analysis.budget_limit) {
      return res.status(403).json({
        success: false,
        message: "Purchase exceeds your authorized budget."
      });
    }

    const order = await createOrder({
      amount: analysis.exact_amount,
      description: analysis.purchase_summary,
      returnUrl:
        `${FRONTEND_URL}/?payment=success&analysisId=${encodeURIComponent(analysisId)}`,
      cancelUrl:
        `${FRONTEND_URL}/?payment=cancelled&analysisId=${encodeURIComponent(analysisId)}`
    });

    session.orderId = order.orderId;

    orderSessions.set(order.orderId, {
      analysisId,
      createdAt: Date.now()
    });

    return res.json({
      success: true,
      order
    });

  } catch (error) {
    return sendError(res, error, 500);
  }
});

// CAPTURE, VERIFY AND PERSIST APPROVED PAYMENT
app.post("/api/paypal/capture-order", async (req, res) => {
  try {
    cleanExpiredSessions();

    const { orderId, analysisId } = req.body;

    if (!orderId || !analysisId) {
      return res.status(400).json({
        success: false,
        message: "Order ID and analysis ID are required."
      });
    }

    // Prevent duplicate transaction records
    const existingTransaction = transactions.find(
      tx => tx.paypalOrderId === orderId
    );

    if (existingTransaction) {
      return res.json({
        success: true,
        payment: {
          orderId: existingTransaction.captureId,
          status: "COMPLETED",
          amount: existingTransaction.amountValue,
          currency: existingTransaction.currency
        },
        transaction: existingTransaction,
        message: "This PayPal payment was already verified and saved."
      });
    }

    const orderSession = orderSessions.get(orderId);
    const purchaseSession = purchaseSessions.get(analysisId);

    if (
      !orderSession ||
      orderSession.analysisId !== analysisId ||
      !purchaseSession ||
      purchaseSession.orderId !== orderId
    ) {
      return res.status(403).json({
        success: false,
        message: "Payment session could not be verified."
      });
    }

    if (purchaseSession.captured) {
      return res.status(409).json({
        success: false,
        message: "This purchase has already been captured."
      });
    }

    // Verify and capture through PayPal
    const payment = await captureOrder(orderId);

    const createdAt = new Date().toISOString();

    const transaction = {
      id: payment.orderId,
      captureId: payment.orderId,
      paypalOrderId: orderId,
      analysisId,
      name:
        purchaseSession.analysis.purchase_summary ||
        "AI-assisted purchase",
      date: new Date(createdAt).toLocaleString(),
      createdAt,
      amountValue: Number(payment.amount).toFixed(2),
      amount: `$${Number(payment.amount).toFixed(2)} ${payment.currency}`,
      currency: payment.currency,
      status: "Completed"
    };

    // Save transaction before returning success
    transactions = [
      transaction,
      ...transactions.filter(
        tx => tx.paypalOrderId !== orderId
      )
    ];

    await saveTransactions();

    purchaseSession.captured = true;
    orderSessions.delete(orderId);

    return res.json({
      success: true,
      payment,
      transaction,
      message: "Your PayPal payment was successfully completed and saved."
    });

  } catch (error) {
    return sendError(res, error, 500);
  }
});

// INVALID API ROUTE
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found."
  });
});

// GLOBAL ERROR HANDLER
app.use((error, req, res, next) => {
  console.error("Server error:", error.message);

  res.status(500).json({
    success: false,
    message: "Internal server error."
  });
});

// START SERVER AFTER LOADING TRANSACTIONS
async function startServer() {
  await loadTransactions();

  app.listen(PORT, () => {
    console.log("------------------------------------");
    console.log("       NEXTPAY AI BACKEND");
    console.log("------------------------------------");
    console.log(`Server: http://localhost:${PORT}`);
    console.log("Environment: PAYPAL SANDBOX");
    console.log(
      `Groq: ${process.env.GROQ_API_KEY ? "Configured" : "Missing"}`
    );
    console.log(
      `PayPal: ${process.env.PAYPAL_CLIENT_ID ? "Configured" : "Missing"}`
    );
    console.log(`Saved transactions: ${transactions.length}`);
    console.log("------------------------------------");
  });
}

startServer().catch(error => {
  console.error("Failed to start NEXTPAY AI:", error);
  process.exit(1);
});
