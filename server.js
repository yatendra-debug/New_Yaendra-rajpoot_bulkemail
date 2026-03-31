const express = require("express");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

const PORT = process.env.PORT || 89829;

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function uniqueValidRecipients(raw) {
  const list = String(raw || "")
    .split(/\n|,/)
    .map(v => v.trim())
    .filter(Boolean)
    .filter(isValidEmail);

  return [...new Set(list)];
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatHtmlMessage(message) {
  return escapeHtml(message).replace(/\n/g, "<br>");
}

function normalizeSenderName(name) {
  return String(name || "").replace(/"/g, "").trim();
}

function createTransporter(email, password) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: email,
      pass: password
    }
  });
}

app.post("/send", async (req, res) => {
  try {
    const { senderName, email, password, subject, message, recipients } = req.body;

    if (!email || !password || !recipients) {
      return res.json({ status: "error", message: "Missing required fields" });
    }

    if (!isValidEmail(email)) {
      return res.json({ status: "error", message: "Invalid sender email" });
    }

    const recipientList = uniqueValidRecipients(recipients);

    if (recipientList.length === 0) {
      return res.json({ status: "error", message: "No valid recipients found" });
    }

    const transporter = createTransporter(email, password);

    try {
      await transporter.verify();
    } catch {
      return res.json({ status: "auth_error" });
    }

    const cleanSenderName = normalizeSenderName(senderName);
    const fromField = cleanSenderName ? `"${cleanSenderName}" <${email}>` : email;

    let sent = 0;
    const safeSubject = String(subject || "").trim();
    const safeText = String(message || "");
    const safeHtml = formatHtmlMessage(safeText);

    for (const to of recipientList) {
      try {
        await transporter.sendMail({
          from: fromField,
          to,
          subject: safeSubject,
          text: safeText,
          html: `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;">${safeHtml}</div>`
        });

        sent++;
      } catch (err) {
        console.log(`Send failed for ${to}:`, err.message);
      }
    }

    return res.json({
      status: "success",
      sent
    });
  } catch (err) {
    console.log("Server error:", err.message);
    return res.json({ status: "error", message: "Server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
