document.addEventListener("DOMContentLoaded", () => {

  if (!sessionStorage.getItem("auth")) {
    location.href = "/login.html";
    return;
  }

  let sending = false;

  const sendBtn = document.getElementById("sendBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  sendBtn.addEventListener("click", () => {
    if (!sending) sendMail();
  });

  logoutBtn.addEventListener("dblclick", async () => {
    if (!sending) {
      await fetch("/logout", { method: "POST" });
      sessionStorage.clear();
      location.href = "/login.html";
    }
  });

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
          email: document.getElementById("gmail").value.trim(),
          password: document.getElementById("apppass").value.trim(),
          subject: document.getElementById("subject").value.trim(),
          message: document.getElementById("message").value.trim(),
          recipients: document.getElementById("to").value.trim()
        })
      });

      const data = await res.json();

      // 🔥 FIX: undefined issue
      if (data.success) {
        alert(`✅ Sent: ${data.sent || 0} emails`);
      } else {
        alert(data.msg || data.message || "Sending failed ❌");
      }

    } catch (err) {
      alert("Server error ❌");
    } finally {
      sending = false;
      sendBtn.disabled = false;
      sendBtn.innerText = "Send All";
    }
  }

});
