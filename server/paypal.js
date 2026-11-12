
import { randomUUID } from "node:crypto";

function getBaseUrl() {
  const url = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";
  const parsed = new URL(url);

  if (parsed.hostname !== "api-m.sandbox.paypal.com" || parsed.protocol !== "https:") {
    throw new Error("Only PayPal Sandbox is permitted.");
  }

  return url;
}

const pendingOrders = new Map();

async function getAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials are missing from server/.env");
  }

  const credentials = Buffer
    .from(`${clientId}:${clientSecret}`)
    .toString("base64");

  const response = await fetch(`${getBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(20000)
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error("Unable to authenticate with PayPal Sandbox.");
  }

  return data.access_token;
}

async function paypalRequest(endpoint, method = "GET", body = null) {
  const token = await getAccessToken();

  const response = await fetch(`${getBaseUrl()}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": randomUUID()
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("PayPal error:", response.status, data.name);
    throw new Error("PayPal payment service returned an error.");
  }

  return data;
}

async function createOrder({ amount, description, returnUrl, cancelUrl }) {
  const paymentAmount = Number(amount);

  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0 || paymentAmount > 100000) {
    throw new Error("Invalid payment amount.");
  }

  if (!description || typeof description !== "string") {
    throw new Error("A purchase description is required.");
  }

  if (!returnUrl || !cancelUrl) {
    throw new Error("PayPal return and cancel URLs are required.");
  }

  const formattedAmount = paymentAmount.toFixed(2);

  const order = await paypalRequest("/v2/checkout/orders", "POST", {
    intent: "CAPTURE",
    purchase_units: [{
      description: description.slice(0, 127),
      amount: {
        currency_code: "USD",
        value: formattedAmount
      }
    }],
    payment_source: {
      paypal: {
        experience_context: {
          payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",
          brand_name: "NEXTPAY AI",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: returnUrl,
          cancel_url: cancelUrl
        }
      }
    }
  });

  const approvalLink = order.links?.find(
    link => link.rel === "payer-action" || link.rel === "approve"
  );

  if (!order.id || !approvalLink) {
    throw new Error("PayPal did not return a valid approval link.");
  }

  pendingOrders.set(order.id, {
    amount: formattedAmount,
    currency: "USD",
    createdAt: Date.now()
  });

  return {
    orderId: order.id,
    approvalUrl: approvalLink.href,
    status: order.status,
    amount: formattedAmount,
    currency: "USD"
  };
}

async function getOrder(orderId) {
  if (!orderId || typeof orderId !== "string") {
    throw new Error("Invalid PayPal order ID.");
  }

  return paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}

async function captureOrder(orderId) {
  const savedOrder = pendingOrders.get(orderId);

  if (!savedOrder) {
    throw new Error("Order not found or expired. Please create a new order.");
  }

  if (Date.now() - savedOrder.createdAt > 30 * 60 * 1000) {
    pendingOrders.delete(orderId);
    throw new Error("Payment session expired.");
  }

  const existingOrder = await getOrder(orderId);

  if (existingOrder.status !== "APPROVED") {
    throw new Error("Buyer approval is required before capture.");
  }

  const amount = existingOrder.purchase_units?.[0]?.amount;

  if (
    amount?.currency_code !== savedOrder.currency ||
    Number(amount?.value).toFixed(2) !== savedOrder.amount
  ) {
    throw new Error("Payment amount verification failed.");
  }

  const capture = await paypalRequest(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    "POST",
    {}
  );

  const details = capture.purchase_units?.[0]?.payments?.captures?.[0];

  if (
    capture.status !== "COMPLETED" ||
    details?.status !== "COMPLETED" ||
    details?.amount?.currency_code !== savedOrder.currency ||
    Number(details?.amount?.value).toFixed(2) !== savedOrder.amount
  ) {
    throw new Error("PayPal payment could not be verified as completed.");
  }

  pendingOrders.delete(orderId);

  return {
    success: true,
    orderId: capture.id,
    status: capture.status,
    amount: details.amount.value,
    currency: details.amount.currency_code,
    message: "PayPal payment completed successfully."
  };
}

export { getAccessToken, createOrder, getOrder, captureOrder };
