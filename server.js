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

const SESSION_TIME = 60 * 60 * 1000;

/* SAFE LIMITS */
const MIN_DELAY = 800;
const MAX_DELAY = 1500;

const MAX_PER_SEND = 25;
const DAILY_LIMIT = 150;
const HOURLY_LIMIT = 40;

/* ================= FIX ================= */
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
      secure: false,
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

function clean(str = "", max = 120) {
  return str.replace(/[\r\n]/g, "").trim().slice(0, max);
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

  if (count > MAX_PER_SEND) return "max";
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

/* LOGIN FIXED */
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

/* LOGOUT (DOUBLE CLICK READY) */
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("secure.sid", { path: "/" });
    res.json({ success: true });
  });
});

/* ================= SEND ================= */

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

    if (!list.length)
      return res.json({ success: false });

    const limit = checkLimits(email, list.length);
    if (limit !== true)
      return res.json({ success: false, message: limit });

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
          text: message,
          headers: {
            "X-Mailer": "NodeMailer"
          }
        });

        sent++;
        await delay(randomDelay());

      } catch {
        continue;
      }
    }

    res.json({ success: true, message: "Sent " + sent });

  } catch {
    res.json({ success: false });
  }
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("🚀 Safe Mailer running on port " + PORT);
});
