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

// 👉 LIMIT SYSTEM
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

// 👉 YOUR SPEED (kept same)
const BATCH_SIZE = 5;
const BATCH_DELAY = 350;

// 👉 micro delay (human behaviour mimic)
function microDelay() {
  return 40 + Math.floor(Math.random() * 60); // 40–100ms
}

// 👉 main API
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

    // 👉 transporter with better config
    const transporter = nodemailer.createTransport({
      service: "gmail",
      pool: true, // connection reuse
      maxConnections: 2,
      maxMessages: 50,
      auth: {
        user: email,
        pass: password
      }
    });

    try {
      await transporter.verify();
    } catch {
      return res.json({ status: "auth_error" });
    }

    const fromField = senderName
      ? `"${senderName}" <${email}>`
      : email;

    let sentCount = 0;

    // 👉 SMART BATCH (not full parallel)
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);

      for (let j = 0; j < batch.length; j++) {
        try {
          await transporter.sendMail({
            from: fromField,
            to: batch[j],
            subject: subject || "",
            text: message || "",
            headers: {
              "X-Mailer": "NodeMailer",
              "X-Priority": "3",
              "Precedence": "bulk"
            }
          });

          sentCount++;

          // 👉 micro delay inside batch
          await new Promise(r => setTimeout(r, microDelay()));

        } catch (err) {
          console.log("Send error:", err.message);
        }
      }

      // 👉 main delay between batches (same speed feel)
      await new Promise(r => setTimeout(r, BATCH_DELAY));
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
