const express = require("express");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express();

// Middlewares
app.use(cors());
app.use(bodyParser.json({ limit: "1mb" }));
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// 👉 Root route (fix "Cannot GET /")
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// 👉 Email limit storage (in-memory)
const emailLimits = {};

// 👉 Check + update limit
function checkAndUpdateLimit(email) {
  const now = Date.now();

  if (!emailLimits[email]) {
    emailLimits[email] = {
      count: 0,
      startTime: now
    };
  }

  const elapsed = (now - emailLimits[email].startTime) / 1000;

  // reset after 1 hour
  if (elapsed > 3600) {
    emailLimits[email] = {
      count: 0,
      startTime: now
    };
  }

  if (emailLimits[email].count >= 28) {
    return false;
  }

  emailLimits[email].count++;
  return true;
}

// 👉 Create transporter safely
function createTransporter(email, password) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: email,
      pass: password
    }
  });
}

// 👉 Send endpoint
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

    // basic validation
    if (!email || !password || !recipients) {
      return res.json({ status: "error", msg: "Missing fields" });
    }

    // limit check
    if (!checkAndUpdateLimit(email)) {
      return res.json({ status: "limit" });
    }

    const transporter = createTransporter(email, password);

    // verify credentials
    try {
      await transporter.verify();
    } catch (err) {
      return res.json({ status: "auth_error" });
    }

    // clean recipient list
    const list = recipients
      .split(/\n|,/)
      .map(e => e.trim())
      .filter(e => e.length > 0);

    // safe sender format
    const fromField = senderName
      ? `"${senderName}" <${email}>`
      : email;

    // send emails one by one (safe)
    for (let i = 0; i < list.length; i++) {
      try {
        await transporter.sendMail({
          from: fromField,
          to: list[i],
          subject: subject || "",
          text: message || "",
          headers: {
            "X-Mailer": "NodeMailer",
            "X-Priority": "3"
          }
        });

        // 👉 SAFE DELAY (important for spam reduction)
        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (err) {
        console.log("Send error:", err.message);
      }
    }

    return res.json({ status: "success" });

  } catch (err) {
    console.log("Server error:", err);
    return res.json({ status: "error" });
  }
});

// 👉 Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
