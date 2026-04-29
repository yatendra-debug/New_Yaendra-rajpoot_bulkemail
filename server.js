"use strict";

const express = require("express");
const session = require("express-session");
const nodemailer = require("nodemailer");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 8080;

/* CONFIG */
const LOGIN_KEY = "@#@#";
const SESSION_SECRET = crypto.randomBytes(32).toString("hex");

/* SAFE LIMITS */
const BATCH_SIZE = 5;
const BATCH_DELAY = 300;
const DAILY_LIMIT = 400;


/* BASIC */
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

/* HELPERS */
const delay = ms => new Promise(r => setTimeout(r, ms));
const randDelay = () => BASE_DELAY + Math.floor(Math.random() * JITTER);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(str = "", max = 2000) {
  return str.replace(/\r\n/g, "\n").trim().slice(0, max);
}

/* AUTH */
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (username === LOGIN_KEY && password === LOGIN_KEY) {
    req.session.user = true;
    return res.json({ success: true });
  }
  res.json({ success: false });
});

function auth(req, res, next) {
  if (req.session.user) return next();
  res.redirect("/");
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

app.get("/launcher", auth, (req, res) => {
  res.sendFile(path.join(__dirname, "public/launcher.html"));
});

/* SEND */
app.post("/send", auth, async (req, res) => {
  try {
    const { senderName, email, password, subject, message, recipients } = req.body;

    if (!email || !password || !recipients) {
      return res.json({ success: false, sent: 0 });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: email, pass: password }
    });

    try {
      await transporter.verify();
    } catch {
      return res.json({ success: false, sent: 0, msg: "Gmail login failed" });
    }

    const list = recipients
      .split(/[\n,]+/)
      .map(e => e.trim())
      .filter(e => emailRegex.test(e))
      .slice(0, DAILY_LIMIT);

    let sent = 0;

    for (let to of list) {

      // 🔥 slight variation (human feel)
      const randomSubject = subject + " " + (Math.random() > 0.5 ? "" : ".");
      const randomMessage = message + (Math.random() > 0.5 ? "\n" : "");

      try {
        await transporter.sendMail({
          from: `"${senderName || email}" <${email}>`,
          to,
          subject: randomSubject,
          text: clean(randomMessage),
        });

        sent++;
        console.log("Sent:", to);

      } catch (err) {
        console.log("Fail:", to);
      }

      await delay(randDelay()); // 🔥 important
    }

    res.json({ success: true, sent });

  } catch (err) {
    res.json({ success: false, sent: 0 });
  }
});

app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
