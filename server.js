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

// root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// ================= LIMIT SYSTEM =================
const emailLimits = {};

function checkLimit(email, total) {
  const now = Date.now();

  if (!emailLimits[email]) {
    emailLimits[email] = { count: 0, start: now };
  }

  const elapsed = (now - emailLimits[email].start) / 1000;

  if (elapsed > 3600) {
    emailLimits[email] = { count: 0, start: now };
  }

  if (emailLimits[email].count + total > 28) {
    return false;
  }

  emailLimits[email].count += total;
  return true;
}

// ================= CONFIG =================
const BATCH_SIZE = 4;
const BASE_DELAY = 300;

// natural delay
function getDelay() {
  return BASE_DELAY + Math.floor(Math.random() * 70); // 300–370ms
}

// ================= TRANSPORT =================
function createTransporter(email, password) {
  return nodemailer.createTransport({
    service: "gmail",
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
    auth: {
      user: email,
      pass: password
    }
  });
}

// ================= SEND API =================
app.post("/send", async (req, res) => {
  try {
    const { senderName, email, password, subject, message, recipients } = req.body;

    if (!email || !password || !recipients) {
      return res.json({ status: "error" });
    }

    const list = recipients
      .split(/\n|,/)
      .map(e => e.trim())
      .filter(Boolean);

    if (!checkLimit(email, list.length)) {
      return res.json({ status: "limit" });
    }

    const transporter = createTransporter(email, password);

    try {
      await transporter.verify();
    } catch {
      return res.json({ status: "auth_error" });
    }

    const fromField = senderName
      ? `"${senderName}" <${email}>`
      : email;

    let sentCount = 0;

    // ================= SAFE SENDING =================
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);

      for (const toEmail of batch) {
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

          // small internal delay
          await new Promise(r => setTimeout(r, 70 + Math.random() * 50));

        } catch (err) {
          console.log("Send error:", err.message);
        }
      }

      // main delay
      await new Promise(r => setTimeout(r, getDelay()));
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

// ================= START =================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
