"use strict";

const express = require("express");
const session = require("express-session");
const nodemailer = require("nodemailer");
const path = require("path");
const helmet = require("helmet");

const app = express();
const PORT = process.env.PORT || 8080;

/* CONFIG */
const LOGIN_KEY = "@##@@&^#%^#";

const BATCH_SIZE = 5;
const BATCH_DELAY = 300;

const DAILY_LIMIT = 400;
const HOURLY_LIMIT = 80;

/* MIDDLEWARE */
app.use(helmet());
app.use(express.json());
app.use(express.static("public"));

app.use(session({
  name: "secure.sid",
  secret: "super_secret_key_123",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 60 * 60 * 1000
  }
}));

/* RATE LIMIT */
const ipMap = new Map();

app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();

  const rec = ipMap.get(ip) || { count: 0, time: now };

  if (now - rec.time > 60000) {
    ipMap.set(ip, { count: 1, time: now });
    return next();
  }

  if (rec.count > 100) return res.status(429).send("Too many requests");

  rec.count++;
  ipMap.set(ip, rec);

  next();
});

/* HELPERS */
const delay = ms => new Promise(r => setTimeout(r, ms));

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(str = "") {
  return str.replace(/[\r\n]/g, "").trim();
}

/* LIMIT */
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

  if (d.count + count > DAILY_LIMIT) return false;
  if (h.count + count > HOURLY_LIMIT) return false;

  d.count += count;
  h.count += count;

  dailyMap.set(sender, d);
  hourlyMap.set(sender, h);

  return true;
}

/* AUTH */
function requireAuth(req, res, next) {
  if (req.session.user === LOGIN_KEY) return next();
  res.status(401).redirect("/");
}

/* ROUTES */

// LOGIN PAGE
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// LOGIN API
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === LOGIN_KEY && password === LOGIN_KEY) {
    req.session.user = LOGIN_KEY;
    return res.json({ success: true });
  }

  res.json({ success: false });
});

// LAUNCHER PAGE
app.get("/launcher", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public/launcher.html"));
});

// SEND MAIL
app.post("/send", requireAuth, async (req, res) => {
  try {
    const { senderName, email, password, subject, message, recipients } = req.body;

    if (!emailRegex.test(email)) return res.json({ success: false });

    const list = recipients.split(/[\n,]+/)
      .map(e => e.trim())
      .filter(e => emailRegex.test(e));

    if (!list.length || list.length > 28)
      return res.json({ success: false });

    if (!checkLimits(email, list.length))
      return res.json({ success: false, message: "Limit reached" });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: email, pass: password }
    });

    let sent = 0;

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(to =>
        transporter.sendMail({
          from: `"${clean(senderName)}" <${email}>`,
          to,
          subject: clean(subject),
          text: message
        })
      ));

      sent += batch.length;
      await delay(BATCH_DELAY);
    }

    res.json({ success: true, message: "Sent " + sent });

  } catch {
    res.json({ success: false });
  }
});

// LOGOUT
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/* START */
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
