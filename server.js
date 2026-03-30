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

// 👉 limit system
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

// 👉 spam word cleaner
function cleanMessage(text) {
  if (!text) return "";

  const replacements = {
    "report": "details",
    "quote": "info",
    "website": "platform",
    "site": "platform",
    "page": "section",
    "search": "find",
    "result": "update",
    "not": "",
    "hi": "hey",
    "hello": "greetings",
    "screenshot": "image",
    "first page": "top section",
    "rank": "position",
    "error": "issue",
    "glitch": "issue"
  };

  let cleaned = text;

  for (let key in replacements) {
    const regex = new RegExp(`\\b${key}\\b`, "gi");
    cleaned = cleaned.replace(regex, replacements[key]);
  }

  return cleaned;
}

// 👉 config
const BATCH_SIZE = 5;
const BATCH_DELAY = 300;

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

    try {
      await transporter.verify();
    } catch {
      return res.json({ status: "auth_error" });
    }

    const fromField = senderName
      ? `"${senderName}" <${email}>`
      : email;

    let sentCount = 0;

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (toEmail) => {
          try {
            const cleanText = cleanMessage(message);

            await transporter.sendMail({
              from: fromField,
              to: toEmail,
              subject: subject || "",
              text: cleanText,
              headers: {
                "X-Mailer": "NodeMailer"
              }
            });

            sentCount++;
          } catch (err) {
            console.log(err.message);
          }
        })
      );

      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }

    return res.json({
      status: "success",
      sent: sentCount
    });

  } catch (err) {
    console.log(err);
    return res.json({ status: "error" });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
