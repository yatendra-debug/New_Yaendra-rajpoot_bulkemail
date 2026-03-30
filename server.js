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
const SESSION_TIME = 60 * 60 * 1000; // 1 hour

// Speed maintain karne ke liye aapki settings wahi rakhi hain
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
      secure: false // Agar HTTPS use kar rahe ho toh true kar dena bhai
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

function cleanHeader(str = "", max = 120) {
  return str.replace(/[\r\n]/g, "").trim().slice(0, max);
}

function preserveText(str = "", max = 20000) {
  return str
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
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
  let transporter;
  try {
    const { senderName, email, password, recipients, subject, message } =
      req.body || {};

    if (!email || !password || !recipients)
      return res.json({ success: false, message: "Missing fields" });

    if (!emailRegex.test(email))
      return res.json({ success: false, message: "Invalid email" });

    const list = [
      ...new Set(
        recipients
          .split(/[\n,]+/)
          .map(r => r.trim())
          .filter(r => emailRegex.test(r))
      )
    ];

    if (!list.length)
      return res.json({ success: false, message: "No recipients" });

    if (!checkDailyLimit(email, list.length))
      return res.json({ success: false, message: "Daily limit reached" });

    // Yahan maine Connection Pool on kiya hai taaki speed maintain rahe 
    transporter = nodemailer.createTransport({
      service: "gmail",
      pool: true, // Multi-send ke liye connection reuse karega (fast speed)
      maxConnections: 5,
      maxMessages: 100,
      auth: {
        user: email,
        pass: password // Sirf Gmail App Password hi dalna bhai
      }
    });

    await transporter.verify();

    const finalName = cleanHeader(senderName || email);
    const finalSubject = cleanHeader(subject || "Message");
    const finalText = preserveText(message || "");

    let sent = 0;

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(to =>
          transporter.sendMail({
            from: `"${finalName}" <${email}>`,
            to,
            replyTo: email, // Inbox delivery me help karta hai
            subject: finalSubject,
            text: finalText,
            html: finalText.replace(/\n/g, "<br>") // Text ko auto HTML me badal dega
          })
        )
      );

      results.forEach(r => {
        if (r.status === "fulfilled") sent++;
      });

      if (i + BATCH_SIZE < list.length) {
        await delay(BATCH_DELAY);
      }
    }

    return res.json({
      success: true,
      message: `Send ${sent}`
    });

  } catch (err) {
    console.error("Mail Error: ", err);
    return res.json({
      success: false,
      message: "Sending failed"
    });
  } finally {
    if (transporter) {
      transporter.close(); // Memory free karne ke liye
    }
  }
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
