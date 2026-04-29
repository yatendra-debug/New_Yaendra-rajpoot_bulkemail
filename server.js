"use strict";

const express = require("express");
const session = require("express-session");
const nodemailer = require("nodemailer");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = 8080;

/* ================= CONFIG ================= */

const LOGIN_KEY = "^%%^&^&%$$#$$%#P#@";

const SESSION_SECRET = crypto.randomBytes(32).toString("hex");
const SESSION_TIME = 60 * 60 * 1000;

/* ⚖️ SAFE LIMIT SETTINGS */
const HOURLY_LIMIT = 27;
const PARALLEL = 2;
const DELAY_MS = 200;

const DAILY_LIMIT = 500;

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

/* ================= SECURITY ================= */

app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

/* ================= RATE LIMIT ================= */

const ipLimiter = new Map();

app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const rec = ipLimiter.get(ip);

  if (!rec || now - rec.start > 60000) {
    ipLimiter.set(ip, { count: 1, start: now });
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

const clean = (t = "", max = 2000) =>
  t.replace(/[\r\n]+/g, "\n").trim().slice(0, max);

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

  return res.json({ success: false, msg: "Wrong login ❌" });
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
      return res.json({ success: false, msg: "Missing fields ❌" });
    }

    if (!emailRegex.test(email)) {
      return res.json({ success: false, msg: "Invalid email ❌" });
    }

    const list = [
      ...new Set(
        recipients
          .split(/[\n,]+/)
          .map(r => r.trim())
          .filter(r => emailRegex.test(r))
      )
    ].slice(0, HOURLY_LIMIT);

    if (!list.length) {
      return res.json({ success: false, msg: "No valid recipients ❌" });
    }

    if (!checkDailyLimit(email, list.length)) {
      return res.json({ success: false, msg: "Daily limit reached ❌" });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: email, pass: password }
    });

    /* 🔥 Gmail verify */
    try {
      await transporter.verify();
    } catch (err) {
      return res.json({
        success: false,
        msg: "Gmail login failed ❌ (App Password use karo)"
      });
    }

    let sent = 0;

    for (let i = 0; i < list.length; i += PARALLEL) {
      const batch = list.slice(i, i + PARALLEL);

      const results = await Promise.allSettled(
        batch.map(to =>
          transporter.sendMail({
            from: `"${clean(senderName || email, 60)}" <${email}>`,
            to,
            subject: clean(subject || "Hello", 120),
            text: clean(message || "Hi"),
            replyTo: email
          })
        )
      );

      results.forEach(r => {
        if (r.status === "fulfilled") sent++;
      });

      await delay(DELAY_MS);
    }

    return res.json({
      success: true,
      sent,
      msg: `Sent ${sent}`
    });

  } catch (err) {
    console.log("ERROR:", err.message);
    return res.json({
      success: false,
      msg: "Server error ❌"
    });
  }
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("✅ Server running on port", PORT);
});
