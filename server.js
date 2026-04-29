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

const BATCH_SIZE = 2;
const DELAY = 120;

/* BASIC */
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

/* LOGIN */
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === LOGIN_KEY && password === LOGIN_KEY) {
    req.session.user = true;
    return res.json({ success: true });
  }

  res.json({ success: false });
});

/* AUTH */
function auth(req, res, next) {
  if (req.session.user) return next();
  res.redirect("/");
}

/* ROUTES */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

app.get("/launcher", auth, (req, res) => {
  res.sendFile(path.join(__dirname, "public/launcher.html"));
});

/* SEND MAIL */
app.post("/send", auth, async (req, res) => {
  try {
    const { senderName, email, password, subject, message, recipients } = req.body;

    if (!email || !password || !recipients) {
      return res.json({ success: false, message: "Missing fields" });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: email,
        pass: password
      }
    });

    // 🔥 VERIFY (important)
    try {
      await transporter.verify();
    } catch (err) {
      console.log("LOGIN ERROR:", err.message);
      return res.json({ success: false, message: "Gmail login failed" });
    }

    const list = recipients
      .split(/[\n,]+/)
      .map(e => e.trim())
      .filter(Boolean);

    let sent = 0;

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);

      for (let to of batch) {
        try {
          await transporter.sendMail({
            from: `"${senderName || email}" <${email}>`,
            to,
            subject: subject || "Hello",
            text: message || "Hi",
          });

          sent++;
          console.log("Sent:", to);

        } catch (err) {
          console.log("FAIL:", to, err.message);
        }
      }

      await new Promise(r => setTimeout(r, DELAY));
    }

    res.json({ success: true, sent });

  } catch (err) {
    console.log("SERVER ERROR:", err.message);
    res.json({ success: false, message: "Sending failed" });
  }
});

/* START */
app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
