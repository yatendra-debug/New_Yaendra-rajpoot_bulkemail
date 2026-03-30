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

// 👉 YOUR CONFIG (as requested)
const BATCH_SIZE = 5;
const BATCH_DELAY = 350;

// 👉 small random delay (extra safety)
function randomDelay() {
  return BATCH_DELAY + Math.floor(Math.random() * 100); // 350–450ms
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

    const transporter = nodemailer.createTransport({
      service: "gmail",
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

    // 👉 SAFE BATCH SENDING
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (toEmail) => {
          try {
            await transporter.sendMail({
              from: fromField,
              to: toEmail,
              subject: subject || "",
              text: message || "",
              headers: {
                "X-Mailer": "NodeMailer",
                "X-Priority": "3"
              }
            });
            sentCount++;
          } catch (err) {
            console.log("Send error:", err.message);
          }
        })
      );

      // 👉 delay between batches (IMPORTANT)
      await new Promise(r => setTimeout(r, randomDelay()));
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
