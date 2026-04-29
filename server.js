"use strict";

const express = require("express");
const session = require("express-session");
const nodemailer = require("nodemailer");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 8080;

/* ================= CONFIG ================= */

const LOGIN_KEY = "@#@#";
const SESSION_SECRET = crypto.randomBytes(32).toString("hex");
const SESSION_TIME = 60 * 60 * 1000; // 1 hour

// Safer sending (burst kam, delay zyada realistic)
const BATCH_SIZE = 2;             // 
const BASE_DELAY = 300;          //
const JITTER = 300;              // 
const DAILY_LIMIT = 10000;          //  

/* ================= BASIC ================= */

app.disable("x-powered-by");

app.use(express.json({ limit: "25kb" }));
app.use(express.urlencoded({ extended: false, limit: "25kb" }));
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

/* ================= SECURITY HEADERS ================= */

app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

/* ================= SIMPLE RATE LIMIT ================= */

const ipLimiter = new Map();
app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const rec = ipLimiter.get(ip);

  if (!rec || now - rec.start > 60000) {
    ipLimiter.set(ip, { count: 1, start: now });
    return next();
  }

  if (rec.count > 80) {
    return res.status(429).send("Too many requests");
  }

  rec.count++;
  next();
});

/* ================= HELPERS ================= */

const sleep = ms => new Promise(r => setTimeout(r, ms));
const randDelay = () => BASE_DELAY + Math.floor(Math.random() * JITTER);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanHeader(str = "", max = 120) {
  return str.replace(/[\r\n]/g, "").trim().slice(0, max);
}

function cleanText(str = "", max = 20000) {
  return str
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, max);
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

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("secure.sid");
    res.json({ success: true });
  });
});

/* ================= SEND MAIL ================= */

app.post("/send", requireAuth, async (req, res) => {
  try {
    const { senderName, email, password, recipients, subject, message } =
      req.body || {};

    if (!email || !password || !recipients) {
      return res.json({ success: false, sent: 0, msg: "Missing fields" });
    }

    if (!emailRegex.test(email)) {
      return res.json({ success: false, sent: 0, msg: "Invalid email" });
    }

    // Unique + valid recipients
    const list = [
      ...new Set(
        recipients
          .split(/[\n,]+/)
          .map(r => r.trim())
          .filter(r => emailRegex.test(r))
      )
    ];

    if (!list.length) {
      return res.json({ success: false, sent: 0, msg: "No valid recipients" });
    }

    if (!checkDailyLimit(email, list.length)) {
      return res.json({ success: false, sent: 0, msg: "Daily limit reached" });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: email, pass: password }
    });

    // Gmail login check
    try {
      await transporter.verify();
    } catch (e) {
      return res.json({
        success: false,
        sent: 0,
        msg: "Gmail login failed (use App Password)"
      });
    }

    const finalName = cleanHeader(senderName || email);
    const finalSubject = cleanHeader(subject || "Hello");
    const finalText = cleanText(message || "");

    let sent = 0;

    // Batch sending
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);

      for (const to of batch) {
        try {
          await transporter.sendMail({
            from: `"${finalName}" <${email}>`,
            to,
            subject: finalSubject,
            text: finalText,
            replyTo: email,
            headers: { "X-Mailer": "NodeMailer" }
          });
          sent++;
        } catch (err) {
          // continue on failure
          console.log("FAIL:", to, err.message);
        }
      }

      // human-like delay
      await sleep(randDelay());
    }

    // 🔥 yahan exact count return hoga (no undefined)
    return res.json({
      success: true,
      sent,                 // <-- UI me yahi number dikha
      msg: `Sent ${sent}`
    });

  } catch (err) {
    console.log("SERVER ERROR:", err.message);
    return res.json({ success: false, sent: 0, msg: "Sending failed" });
  }
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
