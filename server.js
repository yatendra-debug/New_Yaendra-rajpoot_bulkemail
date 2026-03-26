"use strict";

require("dotenv").config();

const express = require("express");
const session = require("express-session");
const nodemailer = require("nodemailer");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 8080;

/* ================= CONFIG ================= */

const LOGIN_KEY = "@##@@&^#%^#";

const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

const SESSION_TIME = 60 * 60 * 1000; // 1 hour

/* MAIL SETTINGS */
const DELAY = 500;         // safe delay
const MAX_PER_SEND = 30;   // per request limit
const DAILY_LIMIT = 200;   // per email/day

/* ================= IMPORTANT FIX ================= */
app.set("trust proxy", 1);

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
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // keep false for Render
      maxAge: SESSION_TIME
    }
  })
);

/* ================= RATE LIMIT ================= */

const ipLimiter = new Map();

setInterval(() => {
  ipLimiter.clear();
}, 10 * 60 * 1000);

app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();

  const rec = ipLimiter.get(ip) || { count: 0, time: now };

  if (now - rec.time > 60000) {
    ipLimiter.set(ip, { count: 1, time: now });
    return next();
  }

  if (rec.count > 80) {
    return res.status(429).send("Too many requests");
  }

  rec.count++;
  ipLimiter.set(ip, rec);

  next();
});

/* ================= HELPERS ================= */

const delay = ms => new Promise(r => setTimeout(r, ms));

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(str = "", max = 120) {
  return str.replace(/[\r\n]/g, "").trim().slice(0, max);
}

/* ================= DAILY LIMIT ================= */

const dailyMap = new Map();

function checkDailyLimit(sender, count) {
  const now = Date.now();
  const rec = dailyMap.get(sender);

  if (!rec || now - rec.start > 86400000) {
    dailyMap.set(sender, { count: 0, start: now });
  }

  const data = dailyMap.get(sender);

  if (data.count + count > DAILY_LIMIT) return false;

  data.count += count;
  return true;
}

/* ================= AUTH ================= */

function requireAuth(req, res, next) {
  if (req.session.user === LOGIN_KEY) return next();
  return res.redirect("/");
}

/* ================= ROUTES ================= */

// LOGIN PAGE
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// LOGIN API (FIXED)
app.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  if (username === LOGIN_KEY && password === LOGIN_KEY) {
    req.session.regenerate(err => {
      if (err) return res.json({ success: false });

      req.session.user = LOGIN_KEY;
      return res.json({ success: true });
    });
  } else {
    return res.json({ success: false });
  }
});

// LAUNCHER PAGE
app.get("/launcher", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public/launcher.html"));
});

// LOGOUT
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("secure.sid", { path: "/" });
    res.json({ success: true });
  });
});

/* ================= SEND MAIL ================= */

app.post("/send", requireAuth, async (req, res) => {
  try {
    const { senderName, email, password, subject, message, recipients } =
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

    if (!list.length || list.length > MAX_PER_SEND)
      return res.json({ success: false });

    if (!checkDailyLimit(email, list.length))
      return res.json({ success: false, message: "Daily limit reached" });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: email,
        pass: password
      }
    });

    await transporter.verify();

    let sent = 0;

    for (const to of list) {
      try {
        await transporter.sendMail({
          from: `"${clean(senderName)}" <${email}>`,
          to,
          subject: clean(subject),
          text: message
        });

        sent++;
        await delay(DELAY);

      } catch {
        continue;
      }
    }

    return res.json({
      success: true,
      message: "Sent " + sent
    });

  } catch {
    return res.json({ success: false });
  }
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});
