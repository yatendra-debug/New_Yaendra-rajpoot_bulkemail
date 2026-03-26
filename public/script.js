async function sendMail() {
  const res = await fetch("/send", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      senderName: senderName.value,
      email: email.value,
      password: password.value,
      subject: subject.value,
      message: message.value,
      recipients: recipients.value
    })
  });

  const data = await res.json();

  if (data.success) {
    alert(data.message);
  } else {
    alert("Error / Limit reached");
  }
}

async function logout() {
  await fetch("/logout", { method: "POST" });
  location.href = "/";
}
