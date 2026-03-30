const express = require("express");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// 👉 open login page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// 👉 email limit store
const emailLimits = {};

function checkLimit(email) {
  const now = Date.now();

  if (!emailLimits[email]) {
    emailLimits[email] = { count: 0, start: now };
  }

  const diff = (now - emailLimits[email].start) / 1000;

  if (diff > 3600) {
    emailLimits[email] = { count: 0, start: now };
  }

  if (emailLimits[email].count >= 28) {
    return false;
  }

  emailLimits[email].count++;
  return true;
}

app.post("/send", async (req, res) => {
  const { senderName, email, password, subject, message, recipients } = req.body;

  if (!checkLimit(email)) {
    return res.json({ status: "limit" });
  }

  let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: email,
      pass: password
    }
  });

  try {
    await transporter.verify();
  } catch (err) {
    return res.json({ status: "auth_error" });
  }

  let list = recipients
    .split(/\n|,/)
    .map(e => e.trim())
    .filter(e => e);

  for (let i = 0; i < list.length; i++) {
    try {
      await transporter.sendMail({
        from: `"${senderName}" <${email}>`, // ✅ sender name fix
        to: list[i],
        subject: subject,
        text: message,
        headers: {
          "X-Mailer": "NodeMailer"
        }
      });

      // 👉 safe delay (spam reduce)
      await new Promise(r => setTimeout(r, 300));

    } catch (err) {
      console.log(err);
    }
  }

  res.json({ status: "success" });
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
