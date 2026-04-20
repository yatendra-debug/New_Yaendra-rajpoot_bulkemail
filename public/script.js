document.addEventListener("DOMContentLoaded", () => {

  // 🔥 LOGIN CHECK FIX
  if (localStorage.getItem("login") !== "true") {
    window.location.href = "/";
    return;
  }

  let sending = false;

  const sendBtn = document.getElementById("sendBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  /* 🚀 SEND CLICK */
  sendBtn.addEventListener("click", () => {
    if (!sending) sendMail();
  });

  /* 🔓 LOGOUT FIX */
  logoutBtn.addEventListener("dblclick", () => {
    if (!sending) {
      localStorage.removeItem("login");
      window.location.href = "/";
    }
  });

  /* 📤 SEND MAIL */
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

    } catch (err) {
      console.log(err);
      alert("Server error ❌");
    } finally {
      sending = false;
      sendBtn.disabled = false;
      sendBtn.innerText = "Send All";
    }
  }

});
