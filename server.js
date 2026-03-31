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

// ===== SIMPLE SUBJECT =====
function getSubject(sub) {
  if (sub && sub.trim() !== "") return sub.trim();
  return "Hello";
}

// ===== FORMAT =====
function format(msg) {
  return msg
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

// ===== EMAIL VALID =====
function isValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function clean(list) {
  return [...new Set(list.filter(isValid))];
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

  // SAFE LIMIT
  if (limits[email].count + total > 15) return false;

  limits[email].count += total;
  return true;
}

// ===== DELAY =====
function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ===== HUMAN DELAY =====
function humanDelay() {
  return 1200 + Math.random() * 1500; // 1.2s – 2.7s
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
          from: email,
          to: to,
          subject: getSubject(subject),
          text: message,
          html: `<div style="font-family:Arial">${format(message)}</div>`
        });

        sent++;

        // human delay
        await wait(humanDelay());

        // long pause every few mails
        if (sent % 5 === 0) {
          await wait(3000 + Math.random() * 2000);
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

// ===== START =====
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
