"use strict";

const express = require("express");
const session = require("express-session");
const nodemailer = require("nodemailer");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 8080;

/* ================= CONFIG ================= */

const LOGIN_KEY = "#$@$#@$@@%%@%@$%@A";

const SESSION_SECRET = crypto.randomBytes(32).toString("hex");
const SESSION_TIME = 60 * 60 * 1000;

/* SPEED */
const BATCH_SIZE = 5;
const BATCH_DELAY = 300;

/* LIMIT */
const DAILY_LIMIT = 300;
const HOURLY_LIMIT = 80;

/* ================= SPAM FILTER ================= */

const WORD_MAP = {
  free: "complimentary",
  offer: "details",
  urgent: "important",
  buy: "get",
  price: "information",
  cheap: "affordable",
  discount: "adjustment",
  deal: "option",
  guarantee: "assurance"
};

function sanitize(text = "") {
  let output = text;

  for (const key in WORD_MAP) {
    const regex = new RegExp(`\\b${key}\\b`, "gi");
    output = output.replace(regex, WORD_MAP[key]);
  }

  return output;
}

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

  if (rec.count > 80) return res.status(429).send("Too many requests");

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
    let { senderName, email, password, recipients, subject, message } =
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
      return res.json({ success: false, message: limit });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      pool: true,
      maxConnections: 2,
      auth: { user: email, pass: password }
    });

    await transporter.verify();

    const finalName = clean(senderName || email);
    const finalSubject = sanitize(clean(subject || "Message"));
    const finalText = sanitize(preserveText(message || ""));

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

    res.json({ success: true, message: "Sent " + sent });

  } catch {
    res.json({ success: false });
  }
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("🚀 Spam-safe Mailer running on port " + PORT);
});
