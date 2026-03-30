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

// 👉 ROOT FIX (IMPORTANT)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// store limits
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
  const { email, password, subject, message, recipients } = req.body;

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
        from: email,
        to: list[i],
        subject: subject,
        text: message // ✅ footer removed
      });

      await new Promise(r => setTimeout(r, 120));
    } catch (err) {
      console.log(err);
    }
  }

  res.json({ status: "success" });
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
