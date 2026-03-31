async function send() {
  const btn = document.getElementById("sendBtn");

  btn.innerText = "Sending...";
  btn.disabled = true;

  try {
    const res = await fetch("/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.value,
        password: pass.value,
        subject: subject.value,
        message: message.value,
        recipients: recipients.value
      })
    });

    const data = await res.json();

    if (data.status === "success") {
      alert(`Sent ${data.sent} ✅`);
    } else if (data.status === "auth_error") {
      alert("Wrong Password ❌");
    } else if (data.status === "limit") {
      alert("Limit Reached ❌");
    } else {
      alert("Error ❌");
    }

  } catch {
    alert("Server Error ❌");
  }

  btn.innerText = "Send All";
  btn.disabled = false;
}

// ===== REAL DOUBLE CLICK LOGOUT =====
let clickCount = 0;
let timer;

const logoutBtn = document.getElementById("logoutBtn");

logoutBtn.addEventListener("click", () => {
  clickCount++;

  if (clickCount === 1) {
    timer = setTimeout(() => {
      clickCount = 0;
    }, 400); // time window for double click
  } else if (clickCount === 2) {
    clearTimeout(timer);
    window.location = "login.html";
  }
});
