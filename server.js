const express = require("express");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

const PORT = process.env.PORT || 89829;

// ===== ROOT =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// ===== YOUR SENDER NAME LIST =====
const names = [
"Olivia","Emma","Amelia","Charlotte","Mia","Sophia","Isabella","Evelyn",
"Ava","Sofia","Camila","Harper","Luna","Eleanor","Violet","Aurora",
"Elizabeth","Eliana","Hazel","Chloe","Ellie","Nora","Gianna","Lily",
"Emily","Aria","Scarlett","Penelope","Zoe","Ella","Avery","Abigail"
];

function getRandomName() {
  return names[Math.floor(Math.random() * names.length)];
}

// ===== SUBJECT =====
function getSubject(sub) {
  if (sub && sub.trim() !== "") return sub.trim();
  return "Hello"; // safest fallback
}

// ===== FORMAT =====
function format(msg) {
  return msg
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/\n/g,"<br>");
}

// ===== VALID =====
function isValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function clean(list) {
  return [...new Set(list.filter(isValid))];
}

// ===== LIMIT (VERY SAFE) =====
const limits = {};

function checkLimit(email, total) {
  const now = Date.now();

  if (!limits[email]) {
    limits[email] = { count: 0, start: now };
  }

  if ((now - limits[email].start) > 3600000) {
    limits[email] = { count: 0, start: now };
  }

  // very low limit = safer inbox
  if (limits[email].count + total > 28) return false;

  limits[email].count += total;
  return true;
}

// ===== DELAY =====
function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ===== HUMAN DELAY =====
function humanDelay() {
  return 1200 + Math.random() * 1600; // 1.5s – 2.5s
}

// ===== TRANSPORT =====
function createTransport(email, pass) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: email,
      pass: pass
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

    if (!isValid(email)) {
      return res.json({ status: "error" });
    }

    let list = clean(recipients.split(/\n|,/).map(e => e.trim()));

    if (!checkLimit(email, list.length)) {
      return res.json({ status: "limit" });
    }

    const transporter = createTransport(email, password);

    try {
      await transporter.verify();
    } catch {
      return res.json({ status: "auth_error" });
    }

    let sent = 0;

    for (let i = 0; i < list.length; i++) {
      const to = list[i];

      try {
        await transporter.sendMail({
          from: `"${getRandomName()}" <${email}>`,
          to: to,
          subject: getSubject(subject),
          text: message,
          html: `<div style="font-family:Arial">${format(message)}</div>`
        });

        sent++;

        // human delay
        await wait(humanDelay());

        // extra pause
        if (sent % 3 === 0) {
          await wait(4000 + Math.random() * 3000);
        }

      } catch (e) {
        console.log("Fail:", to);
      }
    }

    res.json({ status: "success", sent });

  } catch (e) {
    res.json({ status: "error" });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
