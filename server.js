const express = require("express");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

const PORT = process.env.PORT || 89829;

// ===== ROOT =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// ===== NAME LIST =====
const names = [
"Olivia","Emma","Amelia","Charlotte","Mia","Sophia","Isabella","Evelyn",
"Ava","Sofia","Camila","Harper","Luna","Eleanor","Violet","Aurora"
];

// ===== SAFE SUBJECTS =====
const safeSubjects = [
"Hello",
"Quick message",
"Update",
"Information",
"Just checking",
"Hello there"
];

// ===== SAFE GREETINGS =====
const greetings = ["Hi", "Hello", "Hey"];

// ===== RANDOM HELPERS =====
function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomName() {
  return random(names);
}

// ===== SUBJECT FIX =====
function getSubject(userSubject) {
  if (userSubject && userSubject.trim() !== "") {
    return userSubject.trim(); // user ka same subject
  }
  return random(safeSubjects); // auto safe subject
}

// ===== MESSAGE FIX =====
function buildMessage(original) {
  if (!original) return "";

  const greet = random(greetings);

  // no ending added
  return `${greet},\n\n${original.trim()}`;
}

// ===== FORMAT =====
function formatMessage(msg) {
  return msg
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

// ===== EMAIL VALID =====
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ===== CLEAN LIST =====
function cleanList(list) {
  return [...new Set(list.filter(isValidEmail))];
}

// ===== LIMIT =====
const limits = {};

function checkLimit(email, total) {
  const now = Date.now();

  if (!limits[email]) {
    limits[email] = { count: 0, start: now };
  }

  if ((now - limits[email].start) > 3600000) {
    limits[email] = { count: 0, start: now };
  }

  if (limits[email].count + total > 27) return false;

  limits[email].count += total;
  return true;
}

// ===== DELAY =====
const delay = ms => new Promise(r => setTimeout(r, ms));

// ===== SPEED =====
const BATCH_SIZE = 5;
const BATCH_DELAY = 300;

// ===== TRANSPORT =====
function createTransporter(email, password) {
  return nodemailer.createTransport({
    service: "gmail",
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
    auth: {
      user: email,
      pass: password
    }
  });
}

// ===== SEND =====
app.post("/send", async (req, res) => {
  try {
    const { email, password, subject, message, recipients } = req.body;

    if (!email || !password || !recipients) {
      return res.json({ status: "error" });
    }

    if (!isValidEmail(email)) {
      return res.json({ status: "error" });
    }

    let list = recipients.split(/\n|,/).map(e => e.trim());
    list = cleanList(list);

    if (!checkLimit(email, list.length)) {
      return res.json({ status: "limit" });
    }

    const transporter = createTransporter(email, password);

    try {
      await transporter.verify();
    } catch {
      return res.json({ status: "auth_error" });
    }

    let sentCount = 0;

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);

      for (const toEmail of batch) {
        try {
          const senderName = getRandomName();

          const finalSubject = getSubject(subject);
          const finalText = buildMessage(message);
          const htmlMessage = formatMessage(finalText);

          await transporter.sendMail({
            from: `"${senderName}" <${email}>`,
            to: toEmail,
            subject: finalSubject,
            text: finalText,
            html: `<div style="font-family:Arial; line-height:1.6;">${htmlMessage}</div>`
          });

          sentCount++;

        } catch (err) {
          console.log("Fail:", toEmail);
        }
      }

      await delay(BATCH_DELAY);
    }

    return res.json({
      status: "success",
      sent: sentCount
    });

  } catch (err) {
    console.log("Server error:", err.message);
    return res.json({ status: "error" });
  }
});

// ===== START =====
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
