"use strict";

require("dotenv").config();

const express = require("express");
const session = require("express-session");
const nodemailer = require("nodemailer");
const path = require("path");
const crypto = require("crypto");
const helmet = require("helmet");

const app = express();
const PORT = process.env.PORT || 8080;

/* ================= CONFIG ================= */

const LOGIN_KEY = process.env.LOGIN_KEY || "@##@@&^#%^#";

const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

const SESSION_TIME = 60 * 60 * 1000;

const BATCH_SIZE = 5;
const BASE_DELAY = 400; // increased for safety

const DAILY_LIMIT = 300; // safer than 500

/* ================= TRUST PROXY ================= */
app.set("trust proxy", 1);

/* ================= BASIC ================= */

app.disable("x-powered-by");

app.use(helmet());

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
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
      sameSite: "lax",
      maxAge: SESSION_TIME
    }
  })
);

/* ================= RATE LIMIT ================= */

const ipLimiter = new Map();
const loginLimiter = new Map();

setInterval(() => {
  ipLimiter.clear();
  loginLimiter.clear();
}, 10 * 60 * 1000);

app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();

  const rec = ipLimiter.get(ip) || { count: 0, time: now };

  if (now - rec.time > 60000) {
    ipLimiter.set(ip, { count: 1, time: now });
    return next();
  }

  if (rec.count > 80) return res.status(429).send("Too many requests");

  rec.count++;
  ipLimiter.set(ip, rec);

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

/* ================= DAILY LIMIT ================= */

const dailyMap = new Map();

function checkDailyLimit(sender, count) {
  const now = Date.now();
  const rec = dailyMap.get(sender);

  if (!rec || now - rec.start > 86400000) {
    dailyMap.set(sender, { count: 0, start: now });
  }

  const updated = dailyMap.get(sender);

  if (updated.count + count > DAILY_LIMIT) return false;

  updated.count += count;
  return true;
}

/* ================= AUTH ================= */

function requireAuth(req, res, next) {
  if (req.session.user === LOGIN_KEY) return next();
  return res.redirect("/");
}

/* ================= ROUTES ================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

/* LOGIN SAFE */
app.post("/login", (req, res) => {
  const ip = req.ip;
  const attempts = loginLimiter.get(ip) || 0;

  if (attempts > 5) return res.status(429).json({ success: false });

  const { username, password } = req.body || {};

  if (username === LOGIN_KEY && password === LOGIN_KEY) {
    req.session.regenerate(err => {
      if (err) return res.json({ success: false });

      req.session.user = LOGIN_KEY;
      loginLimiter.delete(ip);

      res.json({ success: true });
    });
  } else {
    loginLimiter.set(ip, attempts + 1);
    res.json({ success: false });
  }
});

app.get("/launcher", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public/launcher.html"));
});

/* LOGOUT */
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("secure.sid", { path: "/" });
    res.json({ success: true });
  });
});

/* ================= SEND MAIL ================= */

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
          .map(e => e.trim())
          .filter(e => emailRegex.test(e))
      )
    ];

    if (!list.length || list.length > 28)
      return res.json({ success: false });

    if (!checkDailyLimit(email, list.length))
      return res.json({ success: false, message: "Daily limit reached" });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      pool: true,
      maxConnections: 2,
      maxMessages: 50,
      auth: {
        user: email,
        pass: password
      }
    });

    await transporter.verify();

    const finalName = cleanHeader(senderName || email);
    const finalSubject = cleanHeader(subject || "Message");
    const finalText = preserveText(message || "");

    let sent = 0;

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);

      for (const to of batch) {
        try {
          await transporter.sendMail({
            from: `"${finalName}" <${email}>`,
            to,
            subject: finalSubject,
            text: finalText,
            headers: {
              "X-Mailer": "NodeMailer",
              "X-Priority": "3"
            }
          });

          sent++;

          // human-like delay (random)
          const randomDelay = BASE_DELAY + Math.floor(Math.random() * 300);
          await delay(randomDelay);

        } catch {
          continue;
        }
      }
    }

    return res.json({
      success: true,
      message: `Sent ${sent}`
    });

  } catch {
    return res.json({ success: false });
  }
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("🚀 Pro Mailer running on port " + PORT);
});
