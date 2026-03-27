const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const USERS_FILE = path.join(__dirname, "users.json");
const pendingUsers = {};
const pendingRecovery = {};

function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8") || "[]");
  } catch {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "cuentaoso66@gmail.com",
    pass: "rtenrvokbwrumrnb"
  }
});

app.post("/register/send-code", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.json({ ok: false, message: "Faltan datos" });
    }

    const users = readUsers();

    const existsUser = users.find(u => u.username === username);
    if (existsUser) {
      return res.json({ ok: false, message: "Usuario ya existe" });
    }

    const existsEmail = users.find(u => u.email === email);
    if (existsEmail) {
      return res.json({ ok: false, message: "Correo ya registrado" });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hash = await bcrypt.hash(password, 10);

    pendingUsers[email] = {
      username,
      email,
      password: hash,
      code,
      expires: Date.now() + 300000
    };

    await transporter.sendMail({
      from: '"LX XITERS" <cuentaoso66@gmail.com>',
      to: email,
      subject: "LX XITERS - Código de verificación",
      html: `
      <div style="background:#050505;padding:30px;font-family:Arial;">
        <div style="max-width:520px;margin:auto;background:#111;border-radius:24px;padding:30px;text-align:center;">
          <img src="https://i.imgur.com/pinFJ1F.jpeg"
               style="width:100px;height:100px;object-fit:contain;margin-bottom:20px;filter:drop-shadow(0 0 10px gold);">
          <h1 style="color:#FFD700;font-size:32px;">LX XITERS</h1>
          <p style="color:#ccc;">Código de verificación</p>
          <div style="background:linear-gradient(90deg,#FFD700,#FFC300);color:#000;padding:15px 25px;border-radius:15px;font-size:32px;font-weight:bold;letter-spacing:6px;margin-top:15px;">
            ${code}
          </div>
          <p style="color:#888;margin-top:15px;">Este código vence en 5 minutos</p>
        </div>
      </div>
      `
    });

    res.json({ ok: true, message: "Código enviado al correo" });
  } catch (e) {
    console.log("REGISTER SEND ERROR:", e);
    res.json({ ok: false, message: "Error al enviar correo" });
  }
});

app.post("/register/verify", (req, res) => {
  const { email, code } = req.body;
  const data = pendingUsers[email];

  if (!data) return res.json({ ok: false, message: "No hay registro" });

  if (Date.now() > data.expires) {
    delete pendingUsers[email];
    return res.json({ ok: false, message: "Código expirado" });
  }

  if (data.code !== code) {
    return res.json({ ok: false, message: "Código incorrecto" });
  }

  const users = readUsers();

  users.push({
    username: data.username,
    email: data.email,
    password: data.password
  });

  writeUsers(users);
  delete pendingUsers[email];

  res.json({ ok: true, message: "Cuenta creada correctamente" });
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const users = readUsers();
    const user = users.find(u => u.username === username);

    if (!user) return res.json({ ok: false, message: "Usuario no existe" });

    const ok = await bcrypt.compare(password, user.password);

    if (!ok) return res.json({ ok: false, message: "Contraseña incorrecta" });

    res.json({ ok: true, message: "Bienvenido", user });
  } catch (e) {
    console.log("LOGIN ERROR:", e);
    res.json({ ok: false, message: "Error en login" });
  }
});

app.post("/recover/send", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.json({ ok: false, message: "Ingresa tu correo" });
    }

    const users = readUsers();
    const user = users.find(u => u.email === email);

    if (!user) {
      return res.json({ ok: false, message: "Correo no encontrado" });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    pendingRecovery[email] = {
      code,
      expires: Date.now() + 300000
    };

    await transporter.sendMail({
      from: '"LX XITERS" <cuentaoso66@gmail.com>',
      to: email,
      subject: "LX XITERS - Recuperar contraseña",
      html: `
      <div style="background:#050505;padding:30px;font-family:Arial;">
        <div style="max-width:520px;margin:auto;background:#111;border-radius:24px;padding:30px;text-align:center;">
          <img src="https://i.imgur.com/pinFJ1F.jpeg"
               style="width:100px;height:100px;object-fit:contain;margin-bottom:20px;filter:drop-shadow(0 0 10px gold);">
          <h1 style="color:#FFD700;font-size:32px;">LX XITERS</h1>
          <p style="color:#ccc;">Código para recuperar contraseña</p>
          <div style="background:linear-gradient(90deg,#FFD700,#FFC300);color:#000;padding:15px 25px;border-radius:15px;font-size:32px;font-weight:bold;letter-spacing:6px;margin-top:15px;">
            ${code}
          </div>
          <p style="color:#888;margin-top:15px;">Este código vence en 5 minutos</p>
        </div>
      </div>
      `
    });

    res.json({ ok: true, message: "Código enviado al correo" });
  } catch (e) {
    console.log("RECOVER SEND ERROR:", e);
    res.json({ ok: false, message: "Error al enviar correo" });
  }
});

app.post("/recover/reset", async (req, res) => {
  try {
    const { email, code, password } = req.body;

    if (!email || !code || !password) {
      return res.json({ ok: false, message: "Faltan datos" });
    }

    const data = pendingRecovery[email];

    if (!data) {
      return res.json({ ok: false, message: "No hay recuperación pendiente" });
    }

    if (Date.now() > data.expires) {
      delete pendingRecovery[email];
      return res.json({ ok: false, message: "Código expirado" });
    }

    if (data.code !== code) {
      return res.json({ ok: false, message: "Código incorrecto" });
    }

    const users = readUsers();
    const index = users.findIndex(u => u.email === email);

    if (index === -1) {
      return res.json({ ok: false, message: "Usuario no encontrado" });
    }

    users[index].password = await bcrypt.hash(password, 10);
    writeUsers(users);
    delete pendingRecovery[email];

    res.json({ ok: true, message: "Contraseña actualizada" });
  } catch (e) {
    console.log("RECOVER RESET ERROR:", e);
    res.json({ ok: false, message: "Error al cambiar contraseña" });
  }
});
app.listen(PORT, () => {
  console.log("Servidor corriendo en http://localhost:" + PORT);
});
