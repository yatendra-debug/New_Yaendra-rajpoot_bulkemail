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

// 👉 root
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

  const diff = (now - emailLimits[email].start) / 1000;

  if (diff > 3600) {
    emailLimits[email] = { count: 0, start: now };
  }

  if (emailLimits[email].count + total > 28) {
    return false;
  }

  emailLimits[email].count += total;
  return true;
}

// 👉 ULTRA SAFE CONFIG
const BATCH_SIZE = 1;
const BATCH_DELAY = 450;

// 👉 random delay (human behavior)
function getDelay() {
  return BATCH_DELAY + Math.floor(Math.random() * 200); // 450–650ms
}

app.post("/send", async (req, res) => {
  try {
    const { senderName, email, password, subject, message, recipients } = req.body;

    if (!email || !password || !recipients) {
      return res.json({ status: "error" });
    }

    const list = recipients
      .split(/\n|,/)
      .map(e => e.trim())
      .filter(e => e);

    if (!checkLimit(email, list.length)) {
      return res.json({ status: "limit" });
    }

    // 👉 stable transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      pool: true,
      maxConnections: 1,
      maxMessages: 50,
      auth: {
        user: email,
        pass: password
      }
    });

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

    // 👉 SAFE SENDING (ONE BY ONE)
    for (let i = 0; i < list.length; i++) {
      try {
        await transporter.sendMail({
          from: fromField,
          to: list[i],
          subject: subject || "",
          text: message || "",
          headers: {
            "X-Mailer": "NodeMailer",
            "X-Priority": "3",
            "Precedence": "bulk",
            "List-Unsubscribe": `<mailto:${email}>`
          }
        });

        sentCount++;

        // 👉 delay (IMPORTANT)
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
