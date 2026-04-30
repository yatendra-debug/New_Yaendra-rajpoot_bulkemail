"use strict";

const express = require("express");
const session = require("express-session");
const nodemailer = require("nodemailer");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 8080;

/* ================= CONFIG ================= */

const LOGIN_KEY = "^%%^&^&%$$#$$%#P#@";

const SESSION_SECRET = crypto.randomBytes(32).toString("hex");
const SESSION_TIME = 60 * 60 * 1000;

/* ⚖️ SAFE LIMIT */
const HOURLY_LIMIT = 27;
const PARALLEL = 2;
const DELAY_MS = 250;

/* ================= BASIC ================= */

app.disable("x-powered-by");

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false }));
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

/* ================= HELPERS ================= */

const delay = ms => new Promise(r => setTimeout(r, ms));

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (t = "", max = 1000) =>
  t.replace(/[\r\n]+/g, "\n").trim().slice(0, max);

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
          .map(e => e.trim())
          .filter(e => emailRegex.test(e))
      )
    ].slice(0, HOURLY_LIMIT);

    if (!list.length) {
      return res.json({ success: false, msg: "No valid recipients ❌" });
    }

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
            text: clean(message),

            // 🔥 trust improve
            replyTo: email,
            headers: {
              "X-Mailer": "NodeMailer",
              "X-Priority": "3"
            }
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
    console.log(err.message);
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
