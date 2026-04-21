document.getElementById("sendBtn").onclick = async () => {

  const res = await fetch("/send", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      senderName: senderName.value,
      gmail: gmail.value,
      apppass: apppass.value,
      subject: subject.value,
      message: message.value,
      to: to.value
    })
  });

  const data = await res.json();

  if (!data.success) {
    alert(data.msg);
  } else {
    alert("Sent: " + data.sent);
  }
};
