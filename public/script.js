document.addEventListener("DOMContentLoaded", () => {

  // 🔐 LOGIN CHECK
  if (!sessionStorage.getItem("auth")) {
    location.href = "/login.html";
    return;
  }

  let sending = false;

  const sendBtn = document.getElementById("sendBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  // 📤 SEND BUTTON
  sendBtn.addEventListener("click", () => {
    if (!sending) sendMail();
  });

  // 🔥 REAL DOUBLE CLICK LOGOUT
  let clickTimer = null;

  logoutBtn.addEventListener("click", () => {
    if (sending) return;

    // first click
    if (!clickTimer) {
      clickTimer = setTimeout(() => {
        clickTimer = null;
      }, 400); // time window for double click

      // optional hint
      logoutBtn.innerText = "Click again...";
      setTimeout(() => {
        logoutBtn.innerText = "Logout";
      }, 500);

    } else {
      // second click detected
      clearTimeout(clickTimer);
      clickTimer = null;

      sessionStorage.clear();
      location.href = "/login.html";
    }
  });

  // 📩 SEND MAIL FUNCTION
  async function sendMail() {
    sending = true;
    sendBtn.disabled = true;
    sendBtn.innerText = "Sending...";

    try {
      const res = await fetch("/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderName: document.getElementById("senderName").value.trim(),
          gmail: document.getElementById("gmail").value.trim(),
          apppass: document.getElementById("apppass").value.trim(),
          subject: document.getElementById("subject").value.trim(),
          message: document.getElementById("message").value.trim(),
          to: document.getElementById("to").value.trim()
        })
      });

      const data = await res.json();

      if (!data.success) {
        alert(data.msg || "Sending failed ❌");
        return;
      }

      alert(`Send_1 ✅\nEmails Sent: ${data.sent}`);

    } catch {
      alert("Server error ❌");
    } finally {
      sending = false;
      sendBtn.disabled = false;
      sendBtn.innerText = "Send All";
    }
  }

});
