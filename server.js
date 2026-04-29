"use strict";

const express = require("express");
const session = require("express-session");
const nodemailer = require("nodemailer");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = 8080;

/* ================= LOGIN ================= */

const LOGIN_KEY = "@#@#";

/* ================= SAFE LIMIT SETTINGS ================= */

const HOURLY_LIMIT = 27;
const PARALLEL = 2;
const DELAY_MS = 200;

/* ================= BASIC ================= */

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false
  })
);

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

  return res.json({ success: false, msg: "Wrong login" });
});

app.get("/launcher", (req, res) => {
  if (req.session.user !== LOGIN_KEY) return res.redirect("/");
  res.sendFile(path.join(__dirname, "public/launcher.html"));
});

/* ================= HELPERS ================= */

const sleep = ms => new Promise(r => setTimeout(r, ms));

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ================= SEND MAIL ================= */

app.post("/send", async (req, res) => {
  try {
    const { senderName, gmail, apppass, subject, message, to } = req.body;

    if (!gmail || !apppass || !to) {
      return res.json({ success: false, msg: "Missing fields ❌" });
    }

    if (!emailRegex.test(gmail)) {
      return res.json({ success: false, msg: "Invalid Gmail ❌" });
    }

    /* 🔥 transporter FIX */
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: gmail,
        pass: apppass
      }
    });

    try {
      await transporter.verify();
    } catch {
      return res.json({
        success: false,
        msg: "Gmail login failed (use App Password)"
      });
    }

    let list = to
      .split(/[\n,]+/)
      .map(e => e.trim())
      .filter(e => emailRegex.test(e));

    list = list.slice(0, HOURLY_LIMIT);

    let sent = 0;

    /* 🔥 PARALLEL SEND */
    for (let i = 0; i < list.length; i += PARALLEL) {
      const batch = list.slice(i, i + PARALLEL);

      const results = await Promise.allSettled(
        batch.map(email =>
          transporter.sendMail({
            from: `"${senderName || gmail}" <${gmail}>`,
            to: email,
            subject: subject || "Hello",
            text: message || "Hi"
          })
        )
      );

      results.forEach(r => {
        if (r.status === "fulfilled") sent++;
      });

      await sleep(DELAY_MS);
    }

    /* 🔥 IMPORTANT FIX */
    return res.json({
      success: true,
      sent: sent
    });

  } catch (err) {
    console.log(err);
    return res.json({
      success: false,
      msg: "Sending failed ❌"
    });
  }
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
