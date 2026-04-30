"use strict";

const express = require("express");
const session = require("express-session");
const nodemailer = require("nodemailer");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 8080;

/* ================= CONFIG ================= */

const LOGIN_KEY = "#@";

const SESSION_SECRET = crypto.randomBytes(32).toString("hex");

/* ⚖️ SAFE LIMITS */
const HOURLY_LIMIT = 27;
const PARALLEL = 2;
const DELAY_MS = 250;

/* ================= BASIC ================= */

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false
  })
);

/* ================= CLEAN FILTER ================= */

const spamWords = [
  "webpage","error","report","rank","screenshot",
  "price","quote","information","hello","hi","website"
];

function cleanMessage(text = "") {
  let t = text.toLowerCase();

  spamWords.forEach(word => {
    const reg = new RegExp(word, "gi");
    t = t.replace(reg, "");
  });

  return t
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

/* ================= AUTH ================= */

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === LOGIN_KEY && password === LOGIN_KEY) {
    req.session.user = LOGIN_KEY;
    return res.json({ success: true });
  }

  res.json({ success: false });
});

function auth(req, res, next) {
  if (req.session.user === LOGIN_KEY) return next();
  res.redirect("/");
}

/* ================= SEND ================= */

app.post("/send", auth, async (req, res) => {
  try {
    const { senderName, email, password, recipients, subject, message } =
      req.body;

    if (!email || !password || !recipients) {
      return res.json({ success: false, msg: "Missing fields" });
    }

    const list = recipients
      .split(/[\n,]+/)
      .map(e => e.trim())
      .filter(Boolean)
      .slice(0, HOURLY_LIMIT);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: email, pass: password }
    });

    try {
      await transporter.verify();
    } catch {
      return res.json({
        success: false,
        msg: "Gmail login failed (App Password use karo)"
      });
    }

    let sent = 0;

    for (let i = 0; i < list.length; i += PARALLEL) {
      const batch = list.slice(i, i + PARALLEL);

      const results = await Promise.allSettled(
        batch.map(to =>
          transporter.sendMail({
            from: `"${senderName || email}" <${email}>`,
            to,
            subject: cleanMessage(subject || "Hello"),
            text: cleanMessage(message),

            replyTo: email
          })
        )
      );

      results.forEach(r => {
        if (r.status === "fulfilled") sent++;
      });

      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    return res.json({
      success: true,
      message: sent,   // 🔥 COUNT FIX
      sent
    });

  } catch (err) {
    return res.json({
      success: false,
      msg: "Server error"
    });
  }
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
