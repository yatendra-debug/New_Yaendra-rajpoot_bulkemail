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

/* SAFETY LIMITS (REAL SAFE) */
const BATCH_SIZE = 3;          // ↓ reduced
const MIN_DELAY = 800;         // ↑ slower
const MAX_DELAY = 1500;        // random human delay

const MAX_PER_SEND = 25;       // per request
const DAILY_LIMIT = 150;       // per email per day
const HOURLY_LIMIT = 40;       // per hour

/* ================= TRUST PROXY ================= */
app.set("trust proxy", 1);

/* ================= BASIC ================= */

app.disable("x-powered-by");
app.use(helmet());

app.use(express.json({ limit: "15kb" }));
app.use(express.urlencoded({ extended: false, limit: "15kb" }));
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

  if (rec.count > 60) return res.status(429).send("Too many requests");

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

function preserveText(str = "", max = 15000) {
  return str.replace(/\r\n/g, "\n").slice(0, max);
}

function randomDelay() {
  return MIN_DELAY + Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY));
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

  if (count > MAX_PER_SEND) return "max_per_send";
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
  return res.redirect("/");
}

/* ================= ROUTES ================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

app.post("/login", (req, res) => {
  const ip = req.ip;
  const attempts = loginLimiter.get(ip) || 0;

  if (attempts > 5) return res.status(429).json({ success: false });

  const { username, password } = req.body || {};

  if (username === LOGIN_KEY && password === LOGIN_KEY) {
    req.session.regenerate(() => {
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

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("secure.sid", { path: "/" });
    res.json({ success: true });
  });
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
          .map(e => e.trim())
          .filter(e => emailRegex.test(e))
      )
    ];

    if (!list.length)
      return res.json({ success: false });

    const limit = checkLimits(email, list.length);
    if (limit !== true)
      return res.json({ success: false, message: limit });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      pool: true,
      maxConnections: 1,
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
              "Precedence": "bulk"
            }
          });

          sent++;
          await delay(randomDelay());

        } catch {
          continue;
        }
      }
    }

    res.json({ success: true, message: `Sent ${sent}` });

  } catch {
    res.json({ success: false });
  }
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("🛡️ Ultra Safe Mailer running on port " + PORT);
});
