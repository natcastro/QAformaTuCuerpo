// index.js
require("dotenv").config();
const express = require("express");
const path = require("path");
const knexLib = require("knex");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 3000;

// === KNEX: conexión a PostgreSQL ===
const db = knexLib({
  client: "pg",
  connection: {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "admin",
    database: process.env.DB_NAME || "qa_center",
    port: process.env.DB_PORT || 5432,
  },
});

// === EXPRESS CONFIG ===
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// === SESSION CONFIG ===
app.use(
  session({
    secret: process.env.SESSION_SECRET || "super-secret-natalie",
    resave: false,
    saveUninitialized: false,
  })
);

// currentUser en todas las vistas
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

// ======== Middlewares auth ========
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect("/login");
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).send("No tienes permisos para esta acción");
    }
    next();
  };
}

// ======== LOGIN / LOGOUT ========
app.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await db("users").where({ username, password }).first();

    if (!user) {
      return res.render("login", { error: "Usuario o contraseña incorrectos" });
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      role: user.role,
    };

    res.redirect("/");
  } catch (err) {
    console.error("Error en POST /login:", err);
    res.status(500).send("Error en login");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// ======== LANDING POR ROL ========
app.get("/", requireLogin, (req, res) => {
  const role = req.session.user.role;
  if (role === "manager" || role === "manager_plus") {
    return res.redirect("/manager");
  }
  return res.redirect("/me");
});

// ======== PANEL MANAGER / MANAGER_PLUS ========
app.get("/manager", requireRole(["manager", "manager_plus"]), (req, res) => {
  res.render("manager_dashboard");
});

// ======== PANEL USER (ver sus evaluaciones) ========
app.get("/me", requireRole(["user"]), async (req, res) => {
  const userId = req.session.user.id;

  try {
    const evaluations = await db("evaluations as e")
      .join("users as ev", "e.evaluator_id", "ev.id")
      .select(
        "e.id",
        "e.channel",
        "e.score",
        "e.created_at",
        "ev.name as evaluator_name"
      )
      .where("e.evaluated_user_id", userId)
      .orderBy("e.created_at", "desc");

    res.render("user_dashboard", { evaluations });
  } catch (err) {
    console.error("Error cargando evaluaciones del usuario:", err);
    res.status(500).send("Error al cargar tus evaluaciones");
  }
});

// ===================================================
//  GESTIÓN DE USUARIOS  (solo manager_plus)
// ===================================================
app.get("/users", requireRole(["manager_plus"]), async (req, res) => {
  try {
    const users = await db("users").select("*").orderBy("id", "asc");
    res.render("users_index", { users });
  } catch (err) {
    console.error("Error cargando usuarios:", err);
    res.status(500).send("Error al cargar usuarios");
  }
});

app.post("/users", requireRole(["manager_plus"]), async (req, res) => {
  const { name, email, username, password, role } = req.body;
  try {
    await db("users").insert({ name, email, username, password, role });
    res.redirect("/users");
  } catch (err) {
    console.error("Error creando usuario:", err);
    res.status(500).send("Error al crear usuario");
  }
});

app.post(
  "/users/:id/delete",
  requireRole(["manager_plus"]),
  async (req, res) => {
    const { id } = req.params;
    try {
      await db("users").where({ id }).del();
      res.redirect("/users");
    } catch (err) {
      console.error("Error borrando usuario:", err);
      res.status(500).send("Error al borrar usuario");
    }
  }
);

// ===================================================
//  NUEVA EVALUACIÓN
// ===================================================
app.get(
  "/evaluations/new",
  requireRole(["manager", "manager_plus"]),
  async (req, res) => {
    const currentRole = req.session.user.role;
    const currentId = req.session.user.id;

    try {
      let agents;

      if (currentRole === "manager_plus") {
        // Plus puede evaluar a todos menos a sí mismo
        agents = await db("users")
          .select("id", "name")
          .whereNot("id", currentId)
          .orderBy("name", "asc");
      } else {
        // Manager: puede evaluar a managers y users, pero no a manager_plus ni a sí mismo
        agents = await db("users")
          .select("id", "name")
          .whereNot("role", "manager_plus")
          .andWhereNot("id", currentId)
          .orderBy("name", "asc");
      }

      res.render("evaluation_new", { agents });
    } catch (err) {
      console.error("Error cargando formulario evaluación:", err);
      res.status(500).send("Error al cargar formulario");
    }
  }
);

// Guardar evaluación (desde evaluation.js con fetch)
app.post(
  "/evaluations",
  requireRole(["manager", "manager_plus"]),
  async (req, res) => {
    const evaluatorId = req.session.user.id;
    const { channel, agentId, items, score, generalNotes } = req.body;

    if (!agentId) {
      return res
        .status(400)
        .json({ ok: false, error: "Falta seleccionar agente" });
    }

    try {
      // Insertar cabecera
      const [evaluation] = await db("evaluations")
        .insert({
          channel,
          evaluator_id: evaluatorId,
          evaluated_user_id: agentId,
          score,
          general_notes: generalNotes || null,
        })
        .returning(["id"]);

      const evaluationId = evaluation.id;

      // Insertar ítems de la rúbrica
      for (const item of items) {
        await db("evaluation_items").insert({
          evaluation_id: evaluationId,
          item_key: item.id,
          label: item.label,
          weight: item.weight,
          grade: item.grade,
          notes: item.notes || null,
        });
      }

      res.json({ ok: true, id: evaluationId });
    } catch (err) {
      console.error("Error guardando evaluación:", err);
      res
        .status(500)
        .json({ ok: false, error: "Error interno al guardar evaluación" });
    }
  }
);

// ===================================================
//  VER DETALLE DE UNA EVALUACIÓN
// ===================================================
app.get("/evaluations/:id", requireLogin, async (req, res) => {
  const { id } = req.params;
  const currentUser = req.session.user;

  try {
    const evaluation = await db("evaluations as e")
      .join("users as evalUser", "e.evaluated_user_id", "evalUser.id")
      .join("users as evtr", "e.evaluator_id", "evtr.id")
      .select(
        "e.id",
        "e.channel",
        "e.score",
        "e.general_notes",
        "e.created_at",
        "evalUser.name as evaluated_name",
        "evtr.name as evaluator_name",
        "e.evaluated_user_id"
      )
      .where("e.id", id)
      .first();

    if (!evaluation) {
      return res.status(404).send("Evaluación no encontrada");
    }

    // user solo puede ver sus propias evaluaciones
    if (currentUser.role === "user") {
      if (evaluation.evaluated_user_id !== currentUser.id) {
        return res.status(403).send("No puedes ver esta evaluación");
      }
    }

    const items = await db("evaluation_items")
      .where({ evaluation_id: id })
      .orderBy("id", "asc");

    res.render("evaluation_show", { evaluation, items });
  } catch (err) {
    console.error("Error cargando evaluación:", err);
    res.status(500).send("Error al cargar evaluación");
  }
});

// ======== LEVANTAR SERVIDOR ========
app.listen(PORT, () => {
  console.log(`QA Center escuchando en http://localhost:${PORT}`);
});