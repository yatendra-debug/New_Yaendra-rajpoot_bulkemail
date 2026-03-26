"use strict";

const express = require("express");
const session = require("express-session");
const nodemailer = require("nodemailer");
const path = require("path");
const crypto = require("crypto");
const helmet = require("helmet");

const app = express();
const PORT = 8080;

/* ================= CONFIG ================= */

const LOGIN_KEY = "@##@@&^#%^#";

const SESSION_SECRET = crypto.randomBytes(64).toString("hex");
const SESSION_TIME = 60 * 60 * 1000;

const BATCH_SIZE = 5;
const BATCH_DELAY = 300;

const DAILY_LIMIT = 400;
const HOURLY_LIMIT = 80;

/* ================= SAFE MODE ================= */

const SAFE_MODE = true;

const WORD_MAP = {
  error: "small issue",
  problem: "minor concern",
  urgent: "important"
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

app.use(helmet());

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    name: "secure.sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      maxAge: SESSION_TIME,
      secure: false // true in HTTPS
    }
  })
);

/* ================= CSRF ================= */

function generateCSRF() {
  return crypto.randomBytes(32).toString("hex");
}

app.use((req, res, next) => {
  if (!req.session.csrf) {
    req.session.csrf = generateCSRF();
  }
  res.setHeader("X-CSRF-Token", req.session.csrf);
  next();
});

function verifyCSRF(req, res, next) {
  const token = req.headers["x-csrf-token"];
  if (!token || token !== req.session.csrf) {
    return res.status(403).send("Forbidden");
  }
  next();
}

/* ================= RATE LIMIT ================= */

const ipMap = new Map();
const loginAttempts = new Map();

setInterval(() => {
  ipMap.clear();
  loginAttempts.clear();
}, 10 * 60 * 1000);

app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();

  const rec = ipMap.get(ip) || { count: 0, time: now };

  if (now - rec.time > 60000) {
    ipMap.set(ip, { count: 1, time: now });
    return next();
  }

  if (rec.count > 80) return res.status(429).send("Too many requests");

  rec.count++;
  ipMap.set(ip, rec);

  next();
});

/* ================= HELPERS ================= */

const delay = ms => new Promise(r => setTimeout(r, ms));

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanHeader(str = "", max = 120) {
  return str.replace(/[\r\n]/g, "").trim().slice(0, max);
}

function preserveText(str = "", max = 20000) {
  return str.replace(/\r\n/g, "\n").slice(0, max);
}

/* ================= LIMIT ================= */

const dailyMap = new Map();
const hourlyMap = new Map();

function checkLimits(sender, count) {
  const now = Date.now();

  const d = dailyMap.get(sender) || { count: 0, start: now };
  if (now - d.start > 86400000) {
    d.count = 0;
    d.start = now;
  }

  const h = hourlyMap.get(sender) || { count: 0, start: now };
  if (now - h.start > 3600000) {
    h.count = 0;
    h.start = now;
  }

  if (d.count + count > DAILY_LIMIT) return "daily";
  if (h.count + count > HOURLY_LIMIT) return "hourly";

  d.count += count;
  h.count += count;

  dailyMap.set(sender, d);
  hourlyMap.set(sender, h);

  return true;
}

/* ================= AUTH ================= */

function requireAuth(req, res, next) {
  if (req.session.user === LOGIN_KEY) return next();
  return res.status(401).send("Unauthorized");
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

app.post("/login", (req, res) => {
  const ip = req.ip;

  const attempts = loginAttempts.get(ip) || 0;
  if (attempts > 5) return res.status(429).send("Blocked");

  const { username, password } = req.body || {};

  if (username === LOGIN_KEY && password === LOGIN_KEY) {
    req.session.regenerate(() => {
      req.session.user = LOGIN_KEY;
      loginAttempts.delete(ip);
      res.json({ success: true });
    });
  } else {
    loginAttempts.set(ip, attempts + 1);
    res.json({ success: false });
  }
});

app.get("/launcher", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public/launcher.html"));
});

/* ================= SEND ================= */

app.post("/send", requireAuth, verifyCSRF, async (req, res) => {
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

    if (!list.length || list.length > 28)
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

    res.json({ success: true, message: `Sent ${sent}` });

  } catch {
    res.json({ success: false });
  }
});

/* ================= LOGOUT ================= */

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("🔥 Ultra Secure Server running on port " + PORT);
});
