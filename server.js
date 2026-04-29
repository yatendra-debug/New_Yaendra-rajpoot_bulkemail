"use strict";

const express = require("express");
const session = require("express-session");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();
const PORT = 8080;

/* LOGIN */
const LOGIN_KEY = "@#@#";

/* LIMIT */
const HOURLY_LIMIT = 27;
const PARALLEL = 2;
const DELAY_MS = 200;

/* BASIC */
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: "secret123",
    resave: false,
    saveUninitialized: false
  })
);

/* ROUTES */
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

/* EMAIL */
const sleep = ms => new Promise(r => setTimeout(r, ms));

app.post("/send", async (req, res) => {
  try {
    const { senderName, gmail, apppass, subject, message, to } = req.body;

    if (!gmail || !apppass || !to) {
      return res.json({ success: false, msg: "Missing fields ❌" });
    }

    /* 🔥 IMPORTANT LOG */
    console.log("Sending from:", gmail);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmail,
        pass: apppass
      }
    });

    try {
      await transporter.verify();
      console.log("Gmail connected ✅");
    } catch (err) {
      console.log("Gmail error:", err.message);
      return res.json({
        success: false,
        msg: "Gmail auth failed ❌ (App Password use karo)"
      });
    }

    let list = to
      .split(/[\n,]+/)
      .map(e => e.trim())
      .filter(Boolean)
      .slice(0, HOURLY_LIMIT);

    let sent = 0;

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

    console.log("Total sent:", sent);

    return res.json({
      success: true,
      sent: sent,
      msg: `Sent ${sent}`
    });

  } catch (err) {
    console.log("SERVER ERROR:", err);
    return res.json({
      success: false,
      msg: "Server error ❌"
    });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
