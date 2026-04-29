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

/* SAFE LIMIT */
const HOURLY_LIMIT = 27;
const PARALLEL = 2;
const DELAY_MS = 200;

/* ================= BASIC ================= */

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false
  })
);

/* ================= HELPERS ================= */

const sleep = ms => new Promise(r => setTimeout(r, ms));

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ================= AUTH ================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === LOGIN_KEY && password === LOGIN_KEY) {
    req.session.user = LOGIN_KEY;
    return res.json({ success: true });
  }

  res.json({ success: false });
});

app.get("/launcher", (req, res) => {
  if (req.session.user !== LOGIN_KEY) return res.redirect("/");
  res.sendFile(path.join(__dirname, "public/launcher.html"));
});

/* ================= SEND MAIL ================= */

app.post("/send", async (req, res) => {
  try {
    const { senderName, email, password, recipients, subject, message } =
      req.body;

    if (!email || !password || !recipients) {
      return res.json({ success: false, msg: "Missing fields" });
    }

    if (!emailRegex.test(email)) {
      return res.json({ success: false, msg: "Invalid email" });
    }

    const list = recipients
      .split(/[\n,]+/)
      .map(e => e.trim())
      .filter(e => emailRegex.test(e))
      .slice(0, DAILY_LIMIT);

    if (!list.length) {
      return res.json({ success: false, msg: "No valid emails" });
    }

    /* 🔥 FIXED TRANSPORTER */
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: email,
        pass: password
      }
    });

    /* 🔥 VERIFY (IMPORTANT) */
    try {
      await transporter.verify();
    } catch (err) {
      return res.json({
        success: false,
        msg: "Gmail login failed (use App Password)"
      });
    }

    let sent = 0;

    for (let to of list) {
      try {
        await transporter.sendMail({
          from: `"${senderName || email}" <${email}>`,
          to,
          subject: subject || "Hello",
          text: message || "Hi"
        });

        sent++;
        console.log("Sent:", to);

      } catch (err) {
        console.log("Fail:", to);
      }

      await sleep(DELAY);
    }

    return res.json({
      success: true,
      sent
    });

  } catch (err) {
    console.log(err);
    return res.json({
      success: false,
      msg: "Sending failed"
    });
  }
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
