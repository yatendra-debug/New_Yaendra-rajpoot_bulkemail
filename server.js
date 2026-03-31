const express = require("express");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: "1mb" }));
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// 👉 root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// 👉 LIMIT SYSTEM (per email)
const emailLimits = {};

function checkLimit(email, total) {
  const now = Date.now();

  if (!emailLimits[email]) {
    emailLimits[email] = { count: 0, start: now };
  }

  const elapsed = (now - emailLimits[email].start) / 1000;

  // reset after 1 hour
  if (elapsed > 3600) {
    emailLimits[email] = { count: 0, start: now };
  }

  if (emailLimits[email].count + total > 28) {
    return false;
  }

  emailLimits[email].count += total;
  return true;
}

// 👉 SAFE CONFIG (no aggressive behavior)
const BASE_DELAY = 600; // safe baseline

function getDelay() {
  return BASE_DELAY + Math.floor(Math.random() * 300); // 600–900ms
}

// 👉 transporter (stable + safe)
function createTransporter(email, password) {
  return nodemailer.createTransport({
    service: "gmail",
    pool: true,
    maxConnections: 1,
    maxMessages: 30,
    auth: {
      user: email,
      pass: password
    }
  });
}

// 👉 SEND API
app.post("/send", async (req, res) => {
  try {
    const {
      senderName,
      email,
      password,
      subject,
      message,
      recipients
    } = req.body;

    if (!email || !password || !recipients) {
      return res.json({ status: "error" });
    }

    // 👉 clean recipient list
    const list = recipients
      .split(/\n|,/)
      .map(e => e.trim())
      .filter(e => e);

    // 👉 limit check
    if (!checkLimit(email, list.length)) {
      return res.json({ status: "limit" });
    }

    const transporter = createTransporter(email, password);

    // 👉 verify login
    try {
      await transporter.verify();
    } catch {
      return res.json({ status: "auth_error" });
    }

    const fromField = senderName
      ? `"${senderName}" <${email}>`
      : email;

    let sentCount = 0;

    // 👉 SAFE ONE-BY-ONE SENDING
    for (let i = 0; i < list.length; i++) {
      try {
        await transporter.sendMail({
          from: fromField,
          to: list[i],
          subject: subject || "",
          text:
            (message || "") +
            "\n\nIf this message is not relevant to you, please ignore.",
          headers: {
            "X-Mailer": "NodeMailer",
            "X-Priority": "3",
            "List-Unsubscribe": `<mailto:${email}>`
          }
        });

        sentCount++;

        // 👉 human delay (IMPORTANT)
        await new Promise(r => setTimeout(r, getDelay()));

      } catch (err) {
        console.log("Send error:", err.message);
      }
    }

    return res.json({
      status: "success",
      sent: sentCount
    });

  } catch (err) {
    console.log("Server error:", err);
    return res.json({ status: "error" });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
