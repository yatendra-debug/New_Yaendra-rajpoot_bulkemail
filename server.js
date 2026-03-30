"use strict";

require("dotenv").config();
const express = require("express");
const session = require("express-session");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;

/* ================= CONFIG ================= */

const LOGIN_KEY = process.env.LOGIN_KEY || "#$@$#@$@@%%@%@$%@A";
const SESSION_SECRET = process.env.SESSION_SECRET || "super_secret_session_key_123";
const SESSION_TIME = 60 * 60 * 1000; 

const BATCH_SIZE = 5;
const BATCH_DELAY = 300; 
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
      maxAge: SESSION_TIME,
      secure: false 
    }
  })
);

/* ================= HEADERS ================= */

app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

/* ================= LIMITER ================= */

const clientLimiter = new Map();

app.use((req, res, next) => {
  const clientIp = req.ip;
  const currentTime = Date.now();
  const record = clientLimiter.get(clientIp);

  if (!record || currentTime - record.begin > 60000) {
    clientLimiter.set(clientIp, { total: 1, begin: currentTime });
    return next();
  }

  if (record.total > 100) {
    return res.status(429).send("Slow down");
  }

  record.total++;
  next();
});

/* ================= HELPERS ================= */

const delay = ms => new Promise(r => setTimeout(r, ms));

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanHeader(str = "", max = 120) {
  return str.replace(/[\r\n]/g, "").trim().slice(0, max);
}

function preserveText(str = "", max = 20000) {
  return str
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .slice(0, max);
}

/* ================= REPETITION LIMIT ================= */

const dailyMap = new Map();

function checkDailyLimit(sender, count) {
  const currentTime = Date.now();
  const record = dailyMap.get(sender);

  if (!record || currentTime - record.begin > 86400000) {
    dailyMap.set(sender, { total: 0, begin: currentTime });
  }

  const updated = dailyMap.get(sender);

  if (updated.total + count > DAILY_LIMIT) return false;

  updated.total += count;
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

/* ================= DISPATCH (Wapas /send kar diya hai) ================= */

app.post("/send", requireAuth, async (req, res) => {
  let transporter;
  try {
    const { senderName, email, password, recipients, subject, message } =
      req.body || {};

    if (!email || !password || !recipients)
      return res.json({ success: false, message: "No data" });

    if (!emailRegex.test(email))
      return res.json({ success: false, message: "Bad email" });

    const list = [
      ...new Set(
        recipients
          .split(/[\n,]+/)
          .map(r => r.trim())
          .filter(r => emailRegex.test(r))
      )
    ];

    if (!list.length)
      return res.json({ success: false, message: "Empty list" });

    if (!checkDailyLimit(email, list.length))
      return res.json({ success: false, message: "Limit reached" });

    transporter = nodemailer.createTransport({
      service: "gmail",
      pool: true, 
      maxConnections: 5,
      maxMessages: 100,
      auth: {
        user: email,
        pass: password 
      }
    });

    await transporter.verify();

    const finalName = cleanHeader(senderName || email);
    const finalSubject = cleanHeader(subject || "Message");
    const finalText = preserveText(message || "");

    let count = 0;

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(to =>
          transporter.sendMail({
            from: `"${finalName}" <${email}>`,
            to,
            replyTo: email, 
            subject: finalSubject,
            text: finalText,
            html: finalText.replace(/\n/g, "<br>") 
          })
        )
      );

      results.forEach(r => {
        if (r.status === "fulfilled") count++;
      });

      if (i + BATCH_SIZE < list.length) {
        await delay(BATCH_DELAY);
      }
    }

    return res.json({
      success: true,
      message: `Complete ${count}`
    });

  } catch (err) {
    return res.json({
      success: false,
      message: "Fail"
    });
  } finally {
    if (transporter) {
      transporter.close();
    }
  }
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("Active on " + PORT);
});
