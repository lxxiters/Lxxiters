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
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const USERS_FILE = path.join(__dirname, "users.json");
const pendingUsers = {};
const pendingRecovery = {};

function ensureUsersFile() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, "[]", "utf8");
  }
}

function readUsers() {
  try {
    ensureUsersFile();
    const raw = fs.readFileSync(USERS_FILE, "utf8").trim();
    return JSON.parse(raw || "[]");
  } catch (error) {
    console.log("READ USERS ERROR:", error);
    return [];
  }
}

function writeUsers(users) {
  ensureUsersFile();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

console.log("EMAIL_USER:", EMAIL_USER ? EMAIL_USER : "NO");
console.log("EMAIL_PASS:", EMAIL_PASS ? "OK" : "NO");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
});

transporter.verify((error) => {
  if (error) {
    console.log("SMTP ERROR:", error);
  } else {
    console.log("SMTP listo para enviar");
  }
});

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function buildMailTemplate(title, code) {
  return `
  <div style="background:#050505;padding:30px;font-family:Arial,sans-serif;">
    <div style="max-width:520px;margin:auto;background:#111;border-radius:24px;padding:30px;text-align:center;border:1px solid rgba(255,215,0,.18);">
      <img src="https://i.imgur.com/pinFJ1F.jpeg"
           alt="LX XITERS"
           style="width:100px;height:100px;object-fit:contain;margin-bottom:20px;border-radius:50%;">
      <h1 style="color:#FFD700;font-size:32px;margin:0 0 10px 0;">LX XITERS</h1>
      <p style="color:#ccc;font-size:16px;margin:0 0 18px 0;">${title}</p>
      <div style="background:linear-gradient(90deg,#FFD700,#FFC300);color:#000;padding:15px 25px;border-radius:15px;font-size:32px;font-weight:bold;letter-spacing:6px;margin-top:15px;">
        ${code}
      </div>
      <p style="color:#888;margin-top:18px;">Este código vence en 5 minutos</p>
    </div>
  </div>
  `;
}

async function sendMailCode(to, subject, title, code) {
  if (!EMAIL_USER || !EMAIL_PASS) {
    throw new Error("Faltan EMAIL_USER o EMAIL_PASS");
  }

  return transporter.sendMail({
    from: `"LX XITERS" <${EMAIL_USER}>`,
    to,
    subject,
    html: buildMailTemplate(title, code)
  });
}

app.post("/register/send-code", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.json({ ok: false, message: "Faltan datos" });
    }

    const users = readUsers();

    const existsUser = users.find(
      (u) => u.username.toLowerCase() === String(username).toLowerCase()
    );
    if (existsUser) {
      return res.json({ ok: false, message: "Usuario ya existe" });
    }

    const existsEmail = users.find(
      (u) => u.email.toLowerCase() === String(email).toLowerCase()
    );
    if (existsEmail) {
      return res.json({ ok: false, message: "Correo ya registrado" });
    }

    const code = generateCode();
    const hash = await bcrypt.hash(password, 10);

    pendingUsers[email] = {
      username,
      email,
      password: hash,
      code,
      expires: Date.now() + 5 * 60 * 1000
    };

    await sendMailCode(
      email,
      "LX XITERS - Código de verificación",
      "Código de verificación",
      code
    );

    return res.json({ ok: true, message: "Código enviado al correo" });
  } catch (error) {
    console.log("REGISTER SEND ERROR:", error);
    return res.json({ ok: false, message: "Error al enviar correo" });
  }
});

app.post("/register/verify", (req, res) => {
  try {
    const { email, code } = req.body;
    const data = pendingUsers[email];

    if (!data) {
      return res.json({ ok: false, message: "No hay registro pendiente" });
    }

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

    return res.json({ ok: true, message: "Cuenta creada correctamente" });
  } catch (error) {
    console.log("REGISTER VERIFY ERROR:", error);
    return res.json({ ok: false, message: "Error al verificar código" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.json({ ok: false, message: "Faltan datos" });
    }

    const users = readUsers();
    const user = users.find((u) => u.username === username);

    if (!user) {
      return res.json({ ok: false, message: "Usuario no existe" });
    }

    const ok = await bcrypt.compare(password, user.password);

    if (!ok) {
      return res.json({ ok: false, message: "Contraseña incorrecta" });
    }

    return res.json({
      ok: true,
      message: "Bienvenido",
      user: {
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.log("LOGIN ERROR:", error);
    return res.json({ ok: false, message: "Error en login" });
  }
});

app.post("/recover/send", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.json({ ok: false, message: "Ingresa tu correo" });
    }

    const users = readUsers();
    const user = users.find(
      (u) => u.email.toLowerCase() === String(email).toLowerCase()
    );

    if (!user) {
      return res.json({ ok: false, message: "Correo no encontrado" });
    }

    const code = generateCode();

    pendingRecovery[email] = {
      code,
      expires: Date.now() + 5 * 60 * 1000
    };

    await sendMailCode(
      email,
      "LX XITERS - Recuperar contraseña",
      "Código para recuperar contraseña",
      code
    );

    return res.json({ ok: true, message: "Código enviado al correo" });
  } catch (error) {
    console.log("RECOVER SEND ERROR:", error);
    return res.json({ ok: false, message: "Error al enviar correo" });
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
    const index = users.findIndex(
      (u) => u.email.toLowerCase() === String(email).toLowerCase()
    );

    if (index === -1) {
      return res.json({ ok: false, message: "Usuario no encontrado" });
    }

    users[index].password = await bcrypt.hash(password, 10);
    writeUsers(users);
    delete pendingRecovery[email];

    return res.json({ ok: true, message: "Contraseña actualizada" });
  } catch (error) {
    console.log("RECOVER RESET ERROR:", error);
    return res.json({ ok: false, message: "Error al cambiar contraseña" });
  }
});

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});
