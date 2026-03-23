"use strict";

const express = require("express");
const session = require("express-session");
const nodemailer = require("nodemailer");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = 8080;

/* ================= CONFIG ================= */

const LOGIN_KEY = "^%%^&^&%$$#$$%#";

const SESSION_SECRET = crypto.randomBytes(64).toString("hex");
const SESSION_TIME = 60 * 60 * 1000;

const BATCH_SIZE = 5;
const BATCH_DELAY = 300;

const DAILY_LIMIT = 400;
const HOURLY_LIMIT = 80;

/* ================= SAFE WORD MODE ================= */

// true = risky words ko neutral words me convert karega
const SAFE_MODE = true;

const WORD_MAP = {
  error: "small issue",
  problem: "minor concern",
  issue: "detail",
  report: "note",
  screenshot: "reference",
  image: "visual",
  price: "details",
  cost: "information",
  urgent: "important",
  immediately: "at your convenience"
};

function sanitizeContent(text = "") {
  if (!SAFE_MODE) return text;

  let output = text;

  for (const key in WORD_MAP) {
    const regex = new RegExp(`\\b${key}\\b`, "gi");
    output = output.replace(regex, WORD_MAP[key]);
  }

  return output;
}

/* ================= BASIC ================= */

app.disable("x-powered-by");

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    name: "secure.sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      maxAge: SESSION_TIME
    }
  })
);

/* ================= SECURITY ================= */

app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

/* ================= RATE LIMIT ================= */

const ipMap = new Map();

app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const rec = ipMap.get(ip);

  if (!rec || now - rec.start > 60000) {
    ipMap.set(ip, { count: 1, start: now });
    return next();
  }

  if (rec.count > 100) {
    return res.status(429).send("Too many requests");
  }

  rec.count++;
  next();
});

/* ================= HELPERS ================= */

const delay = ms => new Promise(r => setTimeout(r, ms));

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanHeader(str = "", max = 120) {
  return str.replace(/[\r\n]/g, "").trim().slice(0, max);
}

function preserveText(str = "", max = 20000) {
  return str.replace(/\r\n/g, "\n").replace(/\r/g, "\n").slice(0, max);
}

/* ================= LIMIT ================= */

const dailyMap = new Map();
const hourlyMap = new Map();

function checkLimits(sender, count) {
  const now = Date.now();

  const d = dailyMap.get(sender);
  if (!d || now - d.start > 86400000) {
    dailyMap.set(sender, { count: 0, start: now });
  }

  const dNow = dailyMap.get(sender);
  if (dNow.count + count > DAILY_LIMIT) return "daily";

  const h = hourlyMap.get(sender);
  if (!h || now - h.start > 3600000) {
    hourlyMap.set(sender, { count: 0, start: now });
  }

  const hNow = hourlyMap.get(sender);
  if (hNow.count + count > HOURLY_LIMIT) return "hourly";

  dNow.count += count;
  hNow.count += count;

  return true;
}

/* ================= AUTH ================= */

function requireAuth(req, res, next) {
  if (req.session.user === LOGIN_KEY) return next();
  return res.redirect("/");
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

app.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  if (username === LOGIN_KEY && password === LOGIN_KEY) {
    req.session.user = LOGIN_KEY;
    return res.json({ success: true });
  }

  return res.json({ success: false });
});

app.get("/launcher", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public/launcher.html"));
});

/* ================= SEND ================= */

app.post("/send", requireAuth, async (req, res) => {
  try {
    const { senderName, email, password, recipients, subject, message } =
      req.body || {};

    if (!email || !password || !recipients)
      return res.json({ success: false });

    if (!emailRegex.test(email))
      return res.json({ success: false });

    const list = [
      ...new Set(
        recipients
          .split(/[\n,]+/)
          .map(r => r.trim())
          .filter(r => emailRegex.test(r))
      )
    ];

    if (!list.length)
      return res.json({ success: false });

    const limit = checkLimits(email, list.length);

    if (limit !== true)
      return res.json({ success: false, message: "Limit reached" });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: email, pass: password }
    });

    await transporter.verify();

    const finalName = cleanHeader(senderName || email);
    const finalSubject = sanitizeContent(cleanHeader(subject || "Message"));
    const finalText = sanitizeContent(preserveText(message || ""));

    let sent = 0;

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(to =>
          transporter.sendMail({
            from: `"${finalName}" <${email}>`,
            to,
            subject: finalSubject,
            text: finalText
          })
        )
      );

      results.forEach(r => {
        if (r.status === "fulfilled") sent++;
      });

      await delay(BATCH_DELAY);
    }

    res.json({ success: true, message: `Send ${sent}` });

  } catch {
    res.json({ success: false });
  }
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
