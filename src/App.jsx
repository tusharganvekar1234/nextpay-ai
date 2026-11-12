
import { useState, useEffect, useRef } from "react";
import {
  Activity, ArrowUpRight, Bot, ShieldCheck, Wallet,
  Zap, Settings, Bell, ChevronRight, LockKeyhole,
  CircleDollarSign, CheckCircle2, Sparkles, Menu, X,
  CreditCard, ArrowRight, BrainCircuit, ShoppingBag,
  History, ShieldAlert, CircleHelp, Search, Gauge,
  UserCheck, LoaderCircle, AlertTriangle, Check,
  ExternalLink, RefreshCw, DollarSign
} from "lucide-react";
import "./App.css";

const API_BASE = "http://localhost:5000/api";

const navigation = [
  { name: "Overview", icon: Activity },
  { name: "AI Shopping", icon: BrainCircuit },
  { name: "Trust & Safety", icon: ShieldCheck },
  { name: "Transactions", icon: CreditCard }
];

const examples = [
  "I need cloud hosting under $50",
  "Find software for building AI projects",
  "Help me choose a developer laptop"
];

function App() {
  const [active, setActive] = useState("Overview");
  const [demoScenario, setDemoScenario] = useState("LOW");
  const [request, setRequest] = useState("");
  const [budget, setBudget] = useState("100");
  const [mobileOpen, setMobileOpen] = useState(false);

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [analysisId, setAnalysisId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [captureLoading, setCaptureLoading] = useState(false);

  const [requestCount, setRequestCount] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [transactions, setTransactions] = useState([]);

  const captureAttempted = useRef(false);

  // Load saved transaction history whenever the app starts or the page is refreshed.
  useEffect(() => {
    let cancelled = false;

    async function loadTransactions() {
      try {
        const response = await fetch(`${API_BASE}/transactions`);
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.message || "Could not load transaction history.");
        }
        if (!cancelled) {
          setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
        }
      } catch (err) {
        console.error("Transaction history could not be loaded:", err.message);
      }
    }

    loadTransactions();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setApprovedCount(transactions.length);
  }, [transactions]);

  // Handle PayPal's return after buyer approval.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("payment");

    if (paymentStatus === "cancelled") {
      setNotice("Payment cancelled. No payment was captured.");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (paymentStatus !== "success" || captureAttempted.current) {
      return;
    }

    const orderId = params.get("token");
    const returnedAnalysisId = params.get("analysisId");

    if (!orderId || !returnedAnalysisId) {
      setError("PayPal returned incomplete payment information.");
      return;
    }

    captureAttempted.current = true;
    setCaptureLoading(true);
    setNotice("Verifying your PayPal approval...");

    async function capturePayment() {
      try {
        const response = await fetch(`${API_BASE}/paypal/capture-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            analysisId: returnedAnalysisId
          })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Payment verification failed.");
        }

        const payment = data.payment;
        const savedTransaction = data.transaction || {
          id: payment.orderId,
          name: "AI-assisted purchase",
          date: new Date().toLocaleString(),
          amount: `$${payment.amount} ${payment.currency}`,
          status: "Completed"
        };

        setTransactions(previous => [
          savedTransaction,
          ...previous.filter(tx => tx.id !== savedTransaction.id)
        ]);
        setNotice("Payment completed successfully! Your PayPal Sandbox transaction is verified.");
        setError("");

      } catch (err) {
        setError(err.message);
        setNotice("");
      } finally {
        setCaptureLoading(false);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }

    capturePayment();
  }, []);

  function navigate(page) {
    setActive(page);
    setMobileOpen(false);
    setNotice("");
    setError("");
  }

  function clearAnalysis() {
    setAnalysis(null);
    setAnalysisId(null);
    setError("");
    setNotice("");
  }

  // REAL GROQ AI ANALYSIS
  async function handlePreparePurchase(e) {
    e.preventDefault();

    setError("");
    setNotice("");
    setAnalysis(null);
    setAnalysisId(null);

    if (!request.trim() || request.trim().length < 5) {
      setError("Please describe your purchase in at least 5 characters.");
      return;
    }

    const spendingBudget = Number(budget);

    if (
      !Number.isFinite(spendingBudget) ||
      spendingBudget <= 0 ||
      spendingBudget > 100000
    ) {
      setError("Please enter a valid budget between $1 and $100,000.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: request.trim(),
          budget: spendingBudget
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "AI analysis failed.");
      }

      setAnalysis(data.analysis);
      setAnalysisId(data.analysisId);
      setRequestCount(count => count + 1);
      setNotice("Your AI purchase analysis is ready.");

    } catch (err) {
      setError(
        err.message === "Failed to fetch"
          ? "Cannot connect to the backend. Make sure your server is running."
          : err.message
      );
    } finally {
      setLoading(false);
    }
  }

  // CREATE PAYPAL SANDBOX ORDER
  async function handleCheckout() {
    if (!analysis || !analysisId) return;

    if (analysis.risk_level === "HIGH") {
      setError("This purchase is blocked due to its high risk assessment.");
      return;
    }

    if (
      !analysis.budget_check.passed ||
      !analysis.exact_amount ||
      analysis.exact_amount > Number(budget)
    ) {
      setError("This purchase does not meet your spending rules.");
      return;
    }

    const confirmed = window.confirm(
      `You are about to continue to PayPal Sandbox.\n\nPurchase: ${analysis.purchase_summary}\nAmount: $${analysis.exact_amount} USD\n\nYou will need to approve the payment in PayPal. Continue?`
    );

    if (!confirmed) return;

    setCheckoutLoading(true);
    setError("");
    setNotice("Creating your secure PayPal Sandbox order...");

    try {
      const response = await fetch(`${API_BASE}/paypal/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to create PayPal order.");
      }

      if (!data.order?.approvalUrl) {
        throw new Error("PayPal did not provide an approval link.");
      }

      // Navigate to PayPal's actual buyer approval page.
      window.location.assign(data.order.approvalUrl);

    } catch (err) {
      setError(err.message);
      setNotice("");
      setCheckoutLoading(false);
    }
  }

  // AI RESULT CARD
  function AnalysisResult() {
    if (!analysis) return null;

    const isHighRisk = analysis.risk_level === "HIGH";
    const isMediumRisk = analysis.risk_level === "MEDIUM";
    const canCheckout =
      !isHighRisk &&
      analysis.budget_check.passed &&
      analysis.exact_amount !== null &&
      analysis.exact_amount > 0 &&
      analysis.exact_amount <= Number(budget);

    const riskColor = isHighRisk
      ? "#fb7185"
      : isMediumRisk
        ? "#fbbf24"
        : "#6ee7b7";

    return (
      <section
        className="panel"
        style={{
          marginTop: 20,
          borderColor: isHighRisk ? "#783c4b" : "#59488b",
          background: "linear-gradient(145deg,#17162b,#101624)"
        }}
      >
        <div className="panel-heading">
          <div>
            <div className="eyebrow">
              <BrainCircuit size={15} /> GROQ AI INTELLIGENCE
            </div>
            <h3>Purchase intelligence report</h3>
          </div>

          <span
            style={{
              color: riskColor,
              border: `1px solid ${riskColor}55`,
              background: `${riskColor}14`,
              borderRadius: 20,
              padding: "8px 12px",
              fontSize: 10,
              fontWeight: 700
            }}
          >
            {analysis.risk_level} RISK
          </span>
        </div>

        <div style={{
          marginTop: 22,
          padding: 18,
          borderRadius: 10,
          background: "#0b101d",
          border: "1px solid #30364b"
        }}>
          <div className="command-label">
            <Sparkles size={15} /> AI PURCHASE SUMMARY
          </div>

          <h3 style={{
            fontSize: 19,
            color: "#f1edff",
            margin: "13px 0"
          }}>
            {analysis.purchase_summary}
          </h3>

          <p style={{
            color: "#aab3c7",
            fontSize: 13,
            lineHeight: 1.8,
            margin: 0
          }}>
            {analysis.recommendation}
          </p>
        </div>

        <div className="stats-grid" style={{ marginTop: 15 }}>
          <div className="stat-card">
            <div className="stat-heading">CATEGORY</div>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              marginTop: 17,
              overflowWrap: "anywhere"
            }}>
              {analysis.category.replaceAll("_", " ")}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-heading">PURCHASE AMOUNT</div>
            <div className="stat-value" style={{ fontSize: 23 }}>
              {analysis.exact_amount !== null
                ? `$${Number(analysis.exact_amount).toFixed(2)}`
                : "Not set"}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-heading">BUDGET CHECK</div>
            <div style={{
              fontSize: 14,
              color: analysis.budget_check.passed ? "#6ee7b7" : "#fb7185",
              fontWeight: 700,
              marginTop: 17
            }}>
              {analysis.budget_check.passed ? "PASSED" : "EXCEEDED"}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-heading">HUMAN APPROVAL</div>
            <div style={{
              fontSize: 14,
              color: "#bda8ff",
              fontWeight: 700,
              marginTop: 17
            }}>
              REQUIRED
            </div>
          </div>
        </div>

        <div style={{
          marginTop: 18,
          padding: 17,
          borderRadius: 10,
          border: "1px solid #30364b",
          background: "#0b101d"
        }}>
          <div className="eyebrow">
            <ShieldCheck size={15} /> TRUST FIREWALL ANALYSIS
          </div>

          <div style={{ marginTop: 14 }}>
            {(analysis.risk_reasons.length
              ? analysis.risk_reasons
              : ["No additional risk reasons were returned by the AI."]
            ).map((reason, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "9px 0",
                  color: "#c4ccdd",
                  fontSize: 12,
                  lineHeight: 1.6
                }}
              >
                <AlertTriangle
                  size={15}
                  color={riskColor}
                  style={{ flexShrink: 0, marginTop: 2 }}
                />
                {reason}
              </div>
            ))}
          </div>

          <div className="firewall-rule">
            <CheckCircle2 size={16} />
            <span>Spending limit</span>
            <strong>{analysis.checks.budget ? "PASSED" : "FAILED"}</strong>
          </div>

          <div className="firewall-rule">
            <CheckCircle2 size={16} />
            <span>Human authorization</span>
            <strong>REQUIRED</strong>
          </div>

          <div className="firewall-rule">
            <CheckCircle2 size={16} />
            <span>Merchant verification</span>
            <strong>NOT VERIFIED</strong>
          </div>
        </div>

        {isHighRisk ? (
          <div className="notice-message" style={{
            marginTop: 17,
            borderColor: "#783c4b",
            background: "#301a27",
            color: "#ffb4c0"
          }}>
            <ShieldAlert size={19} />
            <span>Purchase blocked. Your Trust Firewall does not permit high-risk requests.</span>
          </div>
        ) : !analysis.exact_amount ? (
          <div className="notice-message" style={{ marginTop: 17 }}>
            <CircleHelp size={19} />
            <span>
              Please specify the exact intended purchase amount and analyze again before checkout.
            </span>
          </div>
        ) : !canCheckout ? (
          <div className="notice-message" style={{ marginTop: 17 }}>
            <AlertTriangle size={19} />
            <span>Purchase cannot proceed because it exceeds your budget or fails a spending rule.</span>
          </div>
        ) : (
          <div style={{
            marginTop: 20,
            padding: 17,
            background: "#10251f",
            border: "1px solid #28513f",
            borderRadius: 10
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              color: "#77dfb2",
              fontSize: 12,
              fontWeight: 700
            }}>
              <CheckCircle2 size={18} />
              ELIGIBLE FOR PAYPAL CHECKOUT
            </div>

            <p style={{
              color: "#c1c9d8",
              fontSize: 12,
              lineHeight: 1.7
            }}>
              The request passed the current budget and risk checks. Review the amount, then continue to PayPal for your final authorization.
            </p>

            <button
              className="primary-button"
              type="button"
              onClick={handleCheckout}
              disabled={checkoutLoading || captureLoading}
              style={{ width: "100%", justifyContent: "center" }}
            >
              {checkoutLoading ? (
                <>
                  <LoaderCircle className="spin-icon" size={17} />
                  Creating PayPal order...
                </>
              ) : (
                <>
                  <CreditCard size={17} />
                  Continue to PayPal · ${Number(analysis.exact_amount).toFixed(2)}
                  <ExternalLink size={15} />
                </>
              )}
            </button>
          </div>
        )}

        <div style={{
          marginTop: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap"
        }}>
          <span style={{ color: "#8793aa", fontSize: 10 }}>
            Analysis ID: {analysisId?.slice(0, 13)}...
          </span>

          <button
            type="button"
            className="text-button"
            onClick={clearAnalysis}
          >
            <RefreshCw size={13} /> New analysis
          </button>
        </div>
      </section>
    );
  }

  // PURCHASE FORM
  function PurchaseForm() {
    return (
      <section className="command-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">
              <Sparkles size={15} /> YOUR AI SHOPPING ASSISTANT
            </div>

            <h2>What are you looking to buy?</h2>
            <p>Tell us what you need. We'll help you make a smarter purchase.</p>
          </div>

          <div className="agent-status"><span /> {loading ? "ANALYZING" : "READY TO HELP"}</div>
        </div>

        <form onSubmit={handlePreparePurchase}>
          <div className="command-box">
            <label className="command-label" htmlFor="purchase-request">
              <Bot size={16} /> DESCRIBE YOUR PURCHASE
            </label>

            <textarea
              id="purchase-request"
              value={request}
              maxLength={2000}
              onChange={(e) => {
                setRequest(e.target.value);
                setNotice("");
                setError("");
              }}
              placeholder="Example: I want a software subscription for exactly $10. Help me evaluate this purchase."
              rows={4}
              disabled={loading}
            />

            <div className="budget-control">
              <div>
                <label htmlFor="purchase-budget">Your maximum budget</label>
                <small>Set the maximum amount you're comfortable spending.</small>
              </div>

              <div className="budget-input">
                <span>$</span>
                <input
                  id="purchase-budget"
                  type="number"
                  min="1"
                  max="100000"
                  value={budget}
                  onChange={(e) => {
                    setBudget(e.target.value);
                    clearAnalysis();
                  }}
                />
                <span>USD</span>
              </div>
            </div>

            <div className="command-bottom">
              <div className="command-hint">
                <LockKeyhole size={15} />
                You approve every payment before checkout.
              </div>

              <button
                className="primary-button"
                type="submit"
                disabled={loading || checkoutLoading}
              >
                {loading ? (
                  <>
                    <LoaderCircle className="spin-icon" size={17} />
                    AI is thinking...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Find my best option
                    <ArrowUpRight size={17} />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {error && (
          <div className="notice-message" role="alert">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        {notice && !error && (
          <div className="notice-message" role="status" style={{
            borderColor: "#28513f",
            background: "#10251f",
            color: "#80dfb7"
          }}>
            <CheckCircle2 size={18} />
            <span>{notice}</span>
          </div>
        )}

        <div className="quick-prompts">
          <span>NEED AN IDEA?</span>
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setRequest(example);
                clearAnalysis();
              }}
            >
              {example} <ArrowUpRight size={12} />
            </button>
          ))}
        </div>

        {AnalysisResult()}
      </section>
    );
  }

  // OVERVIEW PAGE
  function Overview() {
    return (
      <>
        <section className="welcome-row">
          <div>
            <div className="eyebrow">
              <Sparkles size={14} /> SMARTER SHOPPING STARTS HERE
            </div>
            <h1>Shop smarter.<br /><span>Stay in control.</span></h1>
            <p>Your AI shopping assistant. Your budget. Your final approval.</p>
          </div>

          <div className="date-chip">
            <Activity size={15} /> YOUR PAYMENT WORKSPACE
          </div>
        </section>

        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-heading">YOUR PURCHASE BUDGET <Wallet size={19} /></div>
            <div className="stat-value">${budget || "0"}</div>
            <div className="stat-footer">Your current request limit · USD</div>
          </div>

          <div className="stat-card">
            <div className="stat-heading">AI REQUESTS <BrainCircuit size={19} /></div>
            <div className="stat-value">{String(requestCount).padStart(2, "0")}</div>
            <div className="stat-footer">Analyses completed this session</div>
          </div>

          <div className="stat-card">
            <div className="stat-heading">PAYMENTS APPROVED <ShieldCheck size={19} /></div>
            <div className="stat-value">{String(approvedCount).padStart(2, "0")}</div>
            <div className="stat-footer">Verified Sandbox payments</div>
          </div>

          <div className="stat-card">
            <div className="stat-heading">PAYMENT ENVIRONMENT <CircleDollarSign size={19} /></div>
            <div className="stat-value status-value">SANDBOX</div>
            <div className="stat-footer">PayPal test environment</div>
          </div>
        </section>

        {PurchaseForm()}

        <section className="lower-grid">
          <div className="panel firewall-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow"><ShieldCheck size={14} /> YOUR PROTECTION</div>
                <h3>Trust Firewall</h3>
              </div>
              <span className="active-pill">ACTIVE</span>
            </div>

            <div className="firewall-visual">
              <div className="firewall-ring ring-one" />
              <div className="firewall-ring ring-two" />
              <div className="firewall-core"><ShieldCheck size={36} /></div>
              <span className="firewall-orbit orbit-one"><LockKeyhole size={15} /></span>
              <span className="firewall-orbit orbit-two"><Zap size={15} /></span>
            </div>

            <div className="firewall-rule">
              <CheckCircle2 size={17} />
              <span>Respect your spending limit</span>
              <strong>ON</strong>
            </div>
            <div className="firewall-rule">
              <CheckCircle2 size={17} />
              <span>Human approval required</span>
              <strong>ON</strong>
            </div>
            <div className="firewall-rule">
              <CheckCircle2 size={17} />
              <span>PayPal Sandbox payments</span>
              <strong>ON</strong>
            </div>

            <button className="panel-link" onClick={() => navigate("Trust & Safety")}>
              Manage protection rules <ArrowRight size={15} />
            </button>
          </div>

          <div className="panel transaction-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow"><History size={14} /> YOUR ACTIVITY</div>
                <h3>Recent transactions</h3>
              </div>
              <button className="text-button" onClick={() => navigate("Transactions")}>
                View all <ArrowRight size={14} />
              </button>
            </div>

            {transactions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon"><ShoppingBag size={27} /></div>
                <strong>No transactions yet</strong>
                <p>Your completed PayPal Sandbox payments will appear here.</p>
                <button onClick={() => navigate("AI Shopping")}>
                  Start shopping <ArrowRight size={14} />
                </button>
              </div>
            ) : (
              transactions.slice(0, 4).map(tx => (
                <div className="transaction-row" key={tx.id}>
                  <div className="transaction-icon"><CreditCard size={19} /></div>
                  <div className="transaction-info">
                    <strong>{tx.name}</strong>
                    <small>{tx.date}</small>
                  </div>
                  <div className="transaction-amount">
                    <strong>{tx.amount}</strong>
                    <small>{tx.status}</small>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="bottom-banner">
          <div className="banner-icon"><BrainCircuit size={25} /></div>
          <div>
            <strong>AI makes the recommendation. You make the decision.</strong>
            <p>Every purchase stays within your rules and requires your authorization.</p>
          </div>
          <div className="banner-tag">PAYPAL + AI</div>
        </section>
      </>
    );
  }

  // AI SHOPPING PAGE
  function ShoppingPage() {
    return (
      <>
        <section className="page-intro">
          <div className="eyebrow"><BrainCircuit size={15} /> AI SHOPPING</div>
          <h1>Your personal <span>AI shopper.</span></h1>
          <p>Describe your needs, set your budget and let your AI assistant help.</p>
        </section>

        {PurchaseForm()}

        <div className="info-grid">
          <div className="info-card">
            <Search size={22} />
            <strong>Understand your needs</strong>
            <p>Turn a simple description into a structured purchase request.</p>
          </div>
          <div className="info-card">
            <Gauge size={22} />
            <strong>Respect your budget</strong>
            <p>Keep recommendations within your spending limit.</p>
          </div>
          <div className="info-card">
            <UserCheck size={22} />
            <strong>You stay in control</strong>
            <p>Review the purchase and approve before payment.</p>
          </div>
        </div>
      </>
    );
  }

  
  // TRUST AND SAFETY PAGE
  function SafetyPage() {
    const risk = analysis?.risk_level || null;
    const isHigh = risk === "HIGH";
    const isMedium = risk === "MEDIUM";
    const hasAnalysis = Boolean(analysis);

    const riskColor = isHigh
      ? "#fb7185"
      : isMedium
        ? "#fbbf24"
        : "#6ee7b7";

    const riskWidth = isHigh ? "100%" : isMedium ? "60%" : "25%";

    const budgetPassed = hasAnalysis
      ? analysis.budget_check?.passed
      : null;

    const amountValid = hasAnalysis &&
      analysis.exact_amount !== null &&
      Number(analysis.exact_amount) > 0 &&
      Number(analysis.exact_amount) <= Number(budget);

    const canProceed = hasAnalysis &&
      !isHigh &&
      budgetPassed &&
      amountValid;

    const reasons = analysis?.risk_reasons || [];

    const checks = [
      {
        title: "Spending limit",
        description: "Purchase must remain within your configured budget.",
        passed: hasAnalysis ? budgetPassed : null,
        icon: Wallet
      },
      {
        title: "AI risk assessment",
        description: "Groq AI evaluates the purchase risk category.",
        passed: hasAnalysis ? !isHigh : null,
        icon: BrainCircuit
      },
      {
        title: "Exact purchase amount",
        description: "A valid amount is required before checkout.",
        passed: hasAnalysis ? amountValid : null,
        icon: CircleDollarSign
      },
      {
        title: "Human authorization",
        description: "You must explicitly approve every PayPal payment.",
        passed: true,
        icon: UserCheck
      }
    ];

    return (
      <>
        <section className="page-intro">
          <div className="eyebrow">
            <ShieldCheck size={15} /> AI TRUST FIREWALL
          </div>
          <h1>Your money. <span>Your rules.</span></h1>
          <p>Real-time purchase risk intelligence and explainable safety decisions.</p>
        </section>

        <div className="safety-hero" style={{
          background: "linear-gradient(120deg,#19152e,#111a2c)",
          border: "1px solid #59488b",
          gap: 22
        }}>
          <div className="safety-icon" style={{
            background: "#38275d",
            color: "#c4a7ff"
          }}>
            <ShieldCheck size={45} />
          </div>

          <div style={{ flex: 1 }}>
            <div className="eyebrow">
              <Zap size={14} /> PROTECTION ENGINE
            </div>
            <h2>Trust Firewall is monitoring.</h2>
            <p>
              Every purchase is evaluated against AI risk intelligence,
              budget rules and mandatory human authorization.
            </p>
            <span className="active-pill">PROTECTION ACTIVE</span>
          </div>
        </div>

        <div className="panel full-panel" style={{ marginTop: 20 }}>
          <div className="panel-heading">
            <div>
              <div className="eyebrow">
                <Gauge size={15} /> LIVE RISK INTELLIGENCE
              </div>
              <h3>Purchase risk assessment</h3>
              <p>Based on your latest AI purchase analysis.</p>
            </div>
            <span className="active-pill">
              {hasAnalysis ? "ANALYSIS AVAILABLE" : "AWAITING ANALYSIS"}
            </span>
          </div>

          {!hasAnalysis ? (
            <div className="empty-state large-empty">
              <div className="empty-icon">
                <BrainCircuit size={30} />
              </div>
              <strong>No purchase analysis available</strong>
              <p>
                Submit a purchase request in AI Shopping to see
                its real AI risk assessment here.
              </p>
              <button onClick={() => navigate("AI Shopping")}>
                Analyze a purchase <ArrowRight size={15} />
              </button>
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
              gap: 22,
              marginTop: 20
            }}>
              <div style={{
                background: "#0b101d",
                border: "1px solid #30364b",
                borderRadius: 14,
                padding: 22,
                textAlign: "center"
              }}>
                <div className="eyebrow">AI RISK LEVEL</div>

                <div style={{
                  width: 145,
                  height: 145,
                  borderRadius: "50%",
                  margin: "22px auto",
                  display: "grid",
                  placeItems: "center",
                  background: `conic-gradient(${riskColor} ${riskWidth},#293047 0)`
                }}>
                  <div style={{
                    width: 119,
                    height: 119,
                    borderRadius: "50%",
                    background: "#0b101d",
                    display: "grid",
                    placeItems: "center"
                  }}>
                    <div>
                      <ShieldCheck size={26} color={riskColor} />
                      <div style={{
                        color: riskColor,
                        fontSize: 17,
                        fontWeight: 800,
                        marginTop: 5
                      }}>
                        {risk}
                      </div>
                    </div>
                  </div>
                </div>

                <strong style={{ color: riskColor }}>
                  {isHigh
                    ? "HIGH RISK · BLOCKED"
                    : isMedium
                      ? "MEDIUM RISK · REVIEW"
                      : "LOW RISK · ELIGIBLE"}
                </strong>

                <p style={{
                  color: "#929db3",
                  fontSize: 11,
                  lineHeight: 1.7
                }}>
                  Qualitative risk category returned by Groq AI.
                  This is not a calibrated probability score.
                </p>
              </div>

              <div style={{
                background: "#0b101d",
                border: "1px solid #30364b",
                borderRadius: 14,
                padding: 22
              }}>
                <div className="eyebrow">
                  <BrainCircuit size={14} /> AI DECISION SUMMARY
                </div>

                <h3 style={{
                  color: "#f1edff",
                  marginTop: 17,
                  lineHeight: 1.5
                }}>
                  {analysis.purchase_summary}
                </h3>

                <p style={{
                  color: "#aab3c7",
                  fontSize: 12,
                  lineHeight: 1.8
                }}>
                  {analysis.recommendation}
                </p>

                <div className="firewall-rule">
                  <span>Purchase amount</span>
                  <strong>
                    {analysis.exact_amount != null
                      ? `$${Number(analysis.exact_amount).toFixed(2)}`
                      : "Not specified"}
                  </strong>
                </div>

                <div className="firewall-rule">
                  <span>Your budget</span>
                  <strong>${Number(budget).toFixed(2)}</strong>
                </div>

                <div className="firewall-rule">
                  <span>Budget compliance</span>
                  <strong style={{
                    color: budgetPassed ? "#6ee7b7" : "#fb7185"
                  }}>
                    {budgetPassed ? "PASSED" : "FAILED"}
                  </strong>
                </div>
              </div>
            </div>
          )}
        </div>

        {hasAnalysis && (
          <div className="panel full-panel" style={{ marginTop: 20 }}>
            <div className="panel-heading">
              <div>
                <div className="eyebrow">
                  <AlertTriangle size={15} /> EXPLAINABLE AI
                </div>
                <h3>Why did AI make this decision?</h3>
              </div>
            </div>

            {reasons.length > 0 ? reasons.map((reason, index) => (
              <div key={index} className="firewall-rule"
                style={{ padding: "14px 0" }}>
                <AlertTriangle
                  size={17}
                  color={riskColor}
                  style={{ flexShrink: 0 }}
                />
                <span style={{ flex: 1 }}>{reason}</span>
              </div>
            )) : (
              <p style={{ color: "#aab3c7", fontSize: 13 }}>
                No additional risk reasons were returned by the AI.
              </p>
            )}

            <div style={{
              marginTop: 18,
              padding: 16,
              borderRadius: 10,
              background: canProceed ? "#10251f" : "#301a27",
              border: `1px solid ${canProceed ? "#28513f" : "#783c4b"}`
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: canProceed ? "#80dfb7" : "#ffb4c0",
                fontWeight: 800,
                fontSize: 13
              }}>
                {canProceed
                  ? <CheckCircle2 size={19} />
                  : <ShieldAlert size={19} />}
                {canProceed
                  ? "PURCHASE ELIGIBLE FOR CHECKOUT"
                  : "PURCHASE NOT ELIGIBLE"}
              </div>

              <p style={{
                color: "#c1c9d8",
                fontSize: 12,
                lineHeight: 1.7
              }}>
                {canProceed
                  ? "The current analysis passed the displayed risk and budget checks. Final payment still requires your explicit authorization."
                  : "The current analysis did not pass all checkout conditions. Review the AI decision and purchase rules before proceeding."}
              </p>
            </div>
          </div>
        )}

        {/* INTERACTIVE RISK DECISION SIMULATOR */}
        <div className="panel full-panel" style={{ marginTop: 20 }}>
          <div className="eyebrow">
            <BrainCircuit size={15} /> INTERACTIVE DEMO
          </div>

          <h3 style={{ marginTop: 10 }}>Risk Decision Simulator</h3>
          <p style={{ color: "#aab3c7", fontSize: 12 }}>
            Explore how the Trust Firewall responds to different risk scenarios.
          </p>

          <div style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            margin: "20px 0"
          }}>
            {["LOW", "MEDIUM", "HIGH"].map(level => (
              <button
                key={level}
                type="button"
                onClick={() => setDemoScenario(level)}
                style={{
                  flex: 1,
                  minWidth: 100,
                  padding: 14,
                  borderRadius: 10,
                  cursor: "pointer",
                  fontWeight: 800,
                  color: demoScenario === level ? "#ffffff" : "#aab3c7",
                  background: demoScenario === level
                    ? level === "LOW" ? "#14543e"
                      : level === "MEDIUM" ? "#634717" : "#632a3a"
                    : "#171d2d",
                  border: `1px solid ${
                    level === "LOW" ? "#6ee7b7"
                    : level === "MEDIUM" ? "#fbbf24"
                    : "#fb7185"
                  }`
                }}
              >
                {level} RISK
              </button>
            ))}
          </div>

          {(() => {
            const scenarios = {
              LOW: {
                title: "Purchase eligible",
                icon: CheckCircle2,
                color: "#6ee7b7",
                description: "A routine purchase within the spending rules.",
                decision: "ELIGIBLE FOR REVIEW",
                reasons: [
                  "Low-risk scenario selected",
                  "Illustrative budget check passed",
                  "Human approval still required"
                ]
              },
              MEDIUM: {
                title: "Additional review recommended",
                icon: AlertTriangle,
                color: "#fbbf24",
                description: "A purchase that deserves additional scrutiny.",
                decision: "REVIEW REQUIRED",
                reasons: [
                  "Medium-risk scenario selected",
                  "Review the purchase details carefully",
                  "Human authorization is mandatory"
                ]
              },
              HIGH: {
                title: "Purchase blocked",
                icon: ShieldAlert,
                color: "#fb7185",
                description: "A high-risk scenario that the firewall should reject.",
                decision: "BLOCKED BY FIREWALL",
                reasons: [
                  "High-risk scenario selected",
                  "Checkout must not proceed",
                  "Review and resolve the risk before retrying"
                ]
              }
            };

            const selected = scenarios[demoScenario];
            const DecisionIcon = selected.icon;

            return (
              <div style={{
                padding: 20,
                borderRadius: 12,
                border: `1px solid ${selected.color}66`,
                background: "#0b101d"
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12
                }}>
                  <DecisionIcon color={selected.color} size={30} />
                  <div>
                    <strong style={{
                      color: selected.color,
                      fontSize: 17
                    }}>
                      {selected.title}
                    </strong>
                    <p style={{
                      color: "#aab3c7",
                      fontSize: 12,
                      marginTop: 5
                    }}>
                      {selected.description}
                    </p>
                  </div>
                </div>

                <div style={{
                  marginTop: 18,
                  padding: 13,
                  borderRadius: 8,
                  background: `${selected.color}15`,
                  color: selected.color,
                  fontWeight: 800,
                  fontSize: 13
                }}>
                  FIREWALL DECISION: {selected.decision}
                </div>

                {selected.reasons.map((reason, index) => (
                  <div key={index} className="firewall-rule">
                    <CheckCircle2 size={15} color={selected.color} />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          <p style={{
            color: "#8793aa",
            fontSize: 10,
            marginTop: 15
          }}>
            DEMO MODE ONLY · Illustrative scenarios, not live AI assessments.
            Does not create or authorize PayPal payments.
          </p>
        </div>

        <div className="panel full-panel" style={{ marginTop: 20 }}>
          <div className="eyebrow">
            <LockKeyhole size={15} /> SECURITY CONTROL CENTER
          </div>
          <h3 style={{ marginTop: 10 }}>Your protection rules</h3>

          {checks.map(({ title, description, passed, icon: Icon }) => (
            <div className="policy-row" key={title}>
              <div className="policy-icon"><Icon size={20} /></div>
              <div style={{ flex: 1 }}>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
              <span className="policy-status" style={{
                color: passed === null ? "#fbbf24" :
                  passed ? "#6ee7b7" : "#fb7185"
              }}>
                {passed === null ? "PENDING" :
                  passed ? "PASSED" : "FAILED"}
              </span>
            </div>
          ))}
        </div>
      </>
    );
  }

  // TRANSACTIONS PAGE
  function TransactionsPage() {
    const totalSpent = transactions.reduce(
      (sum, tx) => sum + Number(tx.amountValue || 0),
      0
    );

    const completedCount = transactions.filter(
      tx => tx.status?.toLowerCase() === "completed"
    ).length;

    return (
      <>
        <section className="page-intro">
          <div className="eyebrow"><History size={15} /> PAYMENT INTELLIGENCE</div>
          <h1>Your transaction <span>intelligence.</span></h1>
          <p>A transparent audit trail of your AI-assisted PayPal payments.</p>
        </section>

        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-heading">TOTAL TRANSACTIONS</div>
            <div className="stat-value">{transactions.length}</div>
            <div className="stat-footer">Saved payment records</div>
          </div>

          <div className="stat-card">
            <div className="stat-heading">TOTAL SPENDING</div>
            <div className="stat-value">
              ${totalSpent.toFixed(2)}
            </div>
            <div className="stat-footer">Recorded payment value · USD</div>
          </div>

          <div className="stat-card">
            <div className="stat-heading">COMPLETED PAYMENTS</div>
            <div className="stat-value">{completedCount}</div>
            <div className="stat-footer">Verified captures</div>
          </div>

          <div className="stat-card">
            <div className="stat-heading">PAYMENT SECURITY</div>
            <div className="stat-value status-value">ACTIVE</div>
            <div className="stat-footer">PayPal Sandbox environment</div>
          </div>
        </section>

        <div className="panel full-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">
                <ShieldCheck size={14} /> TRANSPARENT PAYMENT RECORDS
              </div>
              <h3>Transaction audit trail</h3>
              <p>Expand any transaction to inspect its references.</p>
            </div>
            <span className="active-pill">LIVE HISTORY</span>
          </div>

          {transactions.length === 0 ? (
            <div className="empty-state large-empty">
              <div className="empty-icon"><CreditCard size={28} /></div>
              <strong>No payments recorded yet</strong>
              <p>Completed PayPal Sandbox payments will appear here.</p>
              <button onClick={() => navigate("AI Shopping")}>
                Prepare a purchase <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            transactions.map(tx => (
              <details
                key={tx.id}
                style={{
                  marginTop: 14,
                  padding: 16,
                  border: "1px solid #30364b",
                  borderRadius: 12,
                  background: "#101624"
                }}
              >
                <summary style={{
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div className="transaction-icon">
                      <CreditCard size={19} />
                    </div>
                    <div>
                      <strong style={{ color: "#f1edff" }}>{tx.name}</strong>
                      <div style={{ color: "#929db3", fontSize: 11, marginTop: 5 }}>
                        {tx.date}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <strong style={{ color: "#80dfb7" }}>{tx.amount}</strong>
                    <div style={{ color: "#80dfb7", fontSize: 10, marginTop: 5 }}>
                      ● {tx.status}
                    </div>
                  </div>
                </summary>

                <div style={{
                  marginTop: 18,
                  paddingTop: 15,
                  borderTop: "1px solid #30364b"
                }}>
                  <div className="eyebrow">
                    <ShieldCheck size={14} /> PAYMENT VERIFICATION DETAILS
                  </div>

                  {[
                    ["Purchase summary", tx.name],
                    ["PayPal order ID", tx.paypalOrderId || tx.id],
                    ["Transaction reference", tx.id],
                    ["AI analysis reference", tx.analysisId || "Unavailable"],
                    ["Payment date", tx.createdAt
                      ? new Date(tx.createdAt).toLocaleString()
                      : tx.date],
                    ["Currency", tx.currency || "USD"],
                    ["Payment status", tx.status]
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 0",
                        borderBottom: "1px solid #252d40",
                        fontSize: 12
                      }}
                    >
                      <span style={{ color: "#929db3" }}>{label}</span>
                      <strong style={{
                        color: "#e4e8f2",
                        textAlign: "right",
                        overflowWrap: "anywhere",
                        maxWidth: "65%"
                      }}>
                        {value}
                      </strong>
                    </div>
                  ))}

                  <div style={{
                    marginTop: 14,
                    padding: 12,
                    borderRadius: 8,
                    background: "#10251f",
                    color: "#80dfb7",
                    fontSize: 12
                  }}>
                    <CheckCircle2 size={15} style={{
                      verticalAlign: "middle",
                      marginRight: 7
                    }} />
                    This record was saved after successful PayPal payment capture.
                  </div>
                </div>
              </details>
            ))
          )}
        </div>
      </>
    );
  }


  // SETTINGS PAGE
  function SettingsPage() {
    return (
      <>
        <section className="page-intro">
          <div className="eyebrow"><Settings size={15} /> SETTINGS</div>
          <h1>Your shopping <span>preferences.</span></h1>
          <p>Review the settings used for your purchase experience.</p>
        </section>

        <div className="panel full-panel">
          <h3>Default purchase budget</h3>
          <p>Change the starting budget used in your purchase request.</p>

          <div className="settings-budget">
            <label htmlFor="settings-budget">Budget in USD</label>
            <input
              id="settings-budget"
              type="number"
              min="1"
              max="100000"
              value={budget}
              onChange={(e) => {
                setBudget(e.target.value);
                clearAnalysis();
              }}
            />
          </div>

          <div className="settings-note">
            <LockKeyhole size={17} />
            Payment credentials remain on the secure backend.
          </div>
        </div>
      </>
    );
  }

  const pageContent = {
    Overview: Overview(),
    "AI Shopping": ShoppingPage(),
    "Trust & Safety": SafetyPage(),
    Transactions: TransactionsPage(),
    Settings: SettingsPage()
  };

  return (
    <div className="app-shell">
      {captureLoading && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          background: "#080b14eF",
          display: "grid",
          placeItems: "center",
          color: "#c8b7ff",
          fontWeight: 700,
          fontSize: 15
        }}>
          <div style={{ textAlign: "center" }}>
            <LoaderCircle className="spin-icon" size={42} />
            <p>Verifying PayPal payment...</p>
          </div>
        </div>
      )}

      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="brand">
          <div className="brand-icon"><Zap size={22} fill="currentColor" /></div>
          <div>
            <h2>NEXTPAY<span>AI</span></h2>
            <small>INTELLIGENT COMMERCE</small>
          </div>
          <button
            className="mobile-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X />
          </button>
        </div>

        <div className="workspace-label">YOUR WORKSPACE</div>

        <nav>
          {navigation.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-item ${active === name ? "active" : ""}`}
              onClick={() => navigate(name)}
            >
              <Icon size={19} />
              <span>{name}</span>
              {active === name && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="security-card">
            <div className="security-top">
              <ShieldCheck size={19} />
              <span>YOUR PROTECTION</span>
            </div>
            <h4>Your money. Your rules.</h4>
            <p>Every payment requires your authorization.</p>
            <div className="security-line"><span /></div>
            <small>HUMAN APPROVAL REQUIRED</small>
          </div>

          <button
            className={`nav-item settings-item ${active === "Settings" ? "active" : ""}`}
            onClick={() => navigate("Settings")}
          >
            <Settings size={19} /> Settings
          </button>

          <div className="profile">
            <div className="avatar">N</div>
            <div>
              <strong>Personal Workspace</strong>
              <small>PayPal Sandbox</small>
            </div>
            <ChevronRight size={17} />
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button
            className="menu-toggle"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <Menu />
          </button>

          <div className="breadcrumb">
            Workspace <span>/</span> <strong>{active}</strong>
          </div>

          <div className="top-actions">
            <div className="environment"><span /> SANDBOX MODE</div>
            <button className="icon-button" aria-label="Notifications">
              <Bell size={19} />
            </button>
            <div className="user-avatar">N</div>
          </div>
        </header>

        <div className="page-content">
          {pageContent[active] || Overview()}

          <footer>
            © 2026 NEXTPAY AI
            <span>·</span> Intelligent Commerce
            <span>·</span> PayPal Sandbox Prototype
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
