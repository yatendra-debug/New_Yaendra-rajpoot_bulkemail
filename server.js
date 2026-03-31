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
"Ava","Sofia","Camila","Harper","Luna","Eleanor","Violet","Aurora",
"Elizabeth","Eliana","Hazel","Chloe","Ellie","Nora","Gianna","Lily",
"Emily","Aria","Scarlett","Penelope","Zoe","Ella","Avery","Abigail"
];

function getRandomName() {
  return names[Math.floor(Math.random() * names.length)];
}

// ===== VALID EMAIL =====
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
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// safer delay (human-like)
function humanDelay(i) {
  let base = 600 + Math.random() * 600; // 600–1200ms

  // every 5 emails → longer pause
  if (i % 5 === 0 && i !== 0) {
    base += 1500 + Math.random() * 1500;
  }

  return base;
}

// ===== SPEED CONFIG =====
const BATCH_SIZE = 3;       // reduced (safe)
const BATCH_DELAY = 700;    // increased delay

// ===== TRANSPORT =====
function createTransporter(email, password) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: email,
      pass: password
    }
  });
}

// ===== FORMAT PRESERVE =====
function formatMessage(msg) {
  if (!msg) return "";

  return msg
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

// ===== SEND API =====
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

    if (list.length === 0) {
      return res.json({ status: "error" });
    }

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
    const htmlMessage = formatMessage(message);

    // ===== SAFE SEQUENTIAL BATCH =====
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);

      for (let j = 0; j < batch.length; j++) {
        const toEmail = batch[j];

        try {
          const randomName = getRandomName();

          await transporter.sendMail({
            from: `"${randomName}" <${email}>`,
            to: toEmail,
            subject: subject || "",
            text: message || "",
            html: `<div style="font-family:Arial;line-height:1.6;">${htmlMessage}</div>`
          });

          sentCount++;

          // per mail delay
          await delay(humanDelay(i + j));

        } catch (err) {
          console.log("Fail:", toEmail);
        }
      }

      // batch delay
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
