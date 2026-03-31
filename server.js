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

// ===== DATA =====
const names = ["Olivia","Emma","Amelia","Charlotte","Mia","Sophia","Isabella"];
const safeSubjects = ["Hello","Quick message","Update","Information","Just checking"];
const greetings = ["Hi","Hello","Hey"];

const random = (arr) => arr[Math.floor(Math.random() * arr.length)];

function getRandomName() {
  return random(names);
}

function getSubject(userSubject) {
  return userSubject && userSubject.trim() !== "" 
    ? userSubject.trim() 
    : random(safeSubjects);
}

function buildMessage(original) {
  if (!original) return "";
  return `${random(greetings)},\n\n${original.trim()}`;
}

function formatMessage(msg) {
  return msg
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

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

// ===== SPEED CONFIG =====
const BATCH_SIZE = 5;
const BATCH_DELAY = 200; // 👈 thoda fast
const PARALLEL_LIMIT = 2; // 👈 safe parallel

// ===== TRANSPORT =====
function createTransporter(email, password) {
  return nodemailer.createTransport({
    service: "gmail",
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
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

    let list = cleanList(recipients.split(/\n|,/).map(e => e.trim()));

    if (!checkLimit(email, list.length)) {
      return res.json({ status: "limit" });
    }

    const transporter = createTransporter(email, password);

    try {
      await transporter.verify();
    } catch {
      return res.json({ status: "auth_error" });
    }

    let sent = 0;

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);

      // split batch into small parallel groups
      for (let j = 0; j < batch.length; j += PARALLEL_LIMIT) {
        const group = batch.slice(j, j + PARALLEL_LIMIT);

        await Promise.all(
          group.map(async (toEmail) => {
            try {
              const senderName = getRandomName();
              const finalSubject = getSubject(subject);
              const finalText = buildMessage(message);
              const html = formatMessage(finalText);

              await transporter.sendMail({
                from: `"${senderName}" <${email}>`,
                to: toEmail,
                subject: finalSubject,
                text: finalText,
                html: `<div style="font-family:Arial">${html}</div>`
              });

              sent++;
            } catch (e) {
              console.log("Fail:", toEmail);
            }
          })
        );
      }

      await delay(BATCH_DELAY);
    }

    res.json({ status: "success", sent });

  } catch (err) {
    console.log(err.message);
    res.json({ status: "error" });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
