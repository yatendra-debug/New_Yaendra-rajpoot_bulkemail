"use strict";

const express = require("express");
const session = require("express-session");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;

/* ================= CONFIG ================= */

const LOGIN_KEY = "@#@#";

/* ⚖️ SAFE LIMIT */
const HOURLY_LIMIT = 27;
const PARALLEL = 2;
const DELAY_MS = 200;

/* ================= MIDDLEWARE ================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: "secret123",
    resave: false,
    saveUninitialized: false
  })
);

/* ================= AUTH ================= */

function auth(req, res, next) {
  if (req.session.user === LOGIN_KEY) return next();
  return res.redirect("/");
}

/* ================= ROUTES ================= */

// 🔥 LOGIN PAGE
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// 🔥 LOGIN API
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === LOGIN_KEY && password === LOGIN_KEY) {
    req.session.user = LOGIN_KEY;
    return res.json({ success: true });
  }

  return res.json({ success: false });
});

// 🔥 IMPORTANT FIX (LAUNCHER ROUTE)
app.get("/launcher", (req, res) => {
  if (req.session.user !== LOGIN_KEY) {
    return res.redirect("/");
  }

  res.sendFile(path.join(__dirname, "public/launcher.html"));
});

// 🔥 LOGOUT
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/* ================= SEND MAIL ================= */

app.post("/send", auth, async (req, res) => {
  try {
    const { senderName, email, password, recipients, subject, message } =
      req.body;

    if (!email || !password || !recipients) {
      return res.json({ success: false, message: "Missing fields" });
    }

    const list = recipients
      .split(/[\n,]+/)
      .map(e => e.trim())
      .filter(Boolean)
      .slice(0, HOURLY_LIMIT);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: email,
        pass: password
      }
    });

    try {
      await transporter.verify();
    } catch {
      return res.json({
        success: false,
        message: "Gmail login failed (App Password use karo)"
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
            subject: subject || "Hello",
            text: message || "Hi",
            replyTo: email
          })
        )
      );

      results.forEach(r => {
        if (r.status === "fulfilled") sent++;
      });

      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    // 🔥 COUNT FIX (NO MORE undefined)
    return res.json({
      success: true,
      message: sent,
      sent: sent
    });

  } catch (err) {
    return res.json({
      success: false,
      message: "Sending failed"
    });
  }
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
