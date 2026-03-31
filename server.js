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

// ===== EMAIL VALIDATION =====
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

  // safer limit
  if (limits[email].count + total > 15) {
    return false;
  }

  limits[email].count += total;
  return true;
}

// ===== DELAY =====
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// SMART HUMAN DELAY
function humanDelay(i) {
  let base = 800 + Math.random() * 1200; // 0.8–2s

  // every few emails → long pause
  if (i % 4 === 0 && i !== 0) {
    base += 2000 + Math.random() * 2000;
  }

  return base;
}

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

    let list = recipients
      .split(/\n|,/)
      .map(e => e.trim());

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

    // ===== SAFE SENDING =====
    for (let i = 0; i < list.length; i++) {
      const toEmail = list[i];

      try {
        const randomName = getRandomName();

        await transporter.sendMail({
          from: `"${randomName}" <${email}>`,
          to: toEmail,
          subject: subject ? subject.trim() : "Hello",
          text: message ? message.trim() : "Hi",
          html: `
            <div style="font-family: Arial; font-size:14px; line-height:1.5;">
              ${message || "Hi"}
            </div>
          `
        });

        sentCount++;

        // human delay
        await delay(humanDelay(i));

      } catch (err) {
        console.log(`Fail: ${toEmail} → ${err.message}`);
      }
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
