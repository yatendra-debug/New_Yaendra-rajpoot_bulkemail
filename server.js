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

// 👉 Root fix
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// 👉 LIMIT SYSTEM (per email)
const emailLimits = {};

function checkLimit(email, totalToSend) {
  const now = Date.now();

  if (!emailLimits[email]) {
    emailLimits[email] = { count: 0, start: now };
  }

  const diff = (now - emailLimits[email].start) / 1000;

  // reset after 1 hour
  if (diff > 3600) {
    emailLimits[email] = { count: 0, start: now };
  }

  if (emailLimits[email].count + totalToSend > 28) {
    return false;
  }

  emailLimits[email].count += totalToSend;
  return true;
}

// 👉 CONFIG (as you wanted)
const BATCH_SIZE = 5;
const BATCH_DELAY = 300;

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

    const list = recipients
      .split(/\n|,/)
      .map(e => e.trim())
      .filter(e => e);

    // 👉 limit check
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
    } catch (err) {
      return res.json({ status: "auth_error" });
    }

    const fromField = senderName
      ? `"${senderName}" <${email}>`
      : email;

    let successCount = 0;

    // 👉 BATCH SENDING
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
                "X-Mailer": "NodeMailer"
              }
            });

            successCount++;
          } catch (err) {
            console.log("Send error:", err.message);
          }
        })
      );

      // 👉 delay between batches
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }

    return res.json({
      status: "success",
      sent: successCount // 👉 popup ke liye
    });

  } catch (err) {
    console.log("Server error:", err);
    return res.json({ status: "error" });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
