require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const port = process.env.PORT || 3000;
const db = require("knex")({
    client: "pg",
    connection: {
        host : process.env.DB_HOST,
        user : process.env.DB_USERNAME,
        password : process.env.DB_PASSWORD,
        database : process.env.DB_NAME,
        port : process.env.DB_PORT
    }
});

const multer = require('multer');
const uploadRoot = path.join(__dirname, "images");
const uploadDir = path.join(uploadRoot, "uploads");
const uploadDir = uploadRoot;
// Where to store uploaded images
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function(req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

const app = express();

app.set('view engine', 'ejs');
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
    })
)
app.use(express.urlencoded({extended: true}));
app.use(express.json());

app.use((req, res, next) => {
    if (req.path === '/' || req.path === '/login' || req.path === '/logout') return next();
    if (req.session.isLoggedIn) return next();
    else return res.render('login', { error_message: "Please log in to access this page"});
});

app.get("/", (req, res) => {
    if (req.session.isLoggedIn) {        
        res.render("landing", { role: req.session.role });
    } else {
        res.render("login", { error_message: "" });
    }
});

app.post("/login", (req, res) => {
    let sName = req.body.username;
    let sPassword = req.body.password;
    db.select("username", "password", "role")
    .from('security')
    .where("username", sName)
    .andWhere("password", sPassword)
    .then(users => {
      if (users.length > 0) {
        req.session.isLoggedIn = true;
        req.session.username = sName;
        req.session.role = users[0].role;
        res.redirect("/landing");
      } else {
        res.render("login", { error_message: "Invalid login" });
      }
    })
    .catch(err => {
      console.error("Login error:", err);
      res.render("login", { error_message: "Invalid login" });
    });
}); 

app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log(err);
        }
        res.redirect("/");
    });
});

// LANDING
app.get("/landing", async (req, res) => {
  if (!req.session.isLoggedIn) {
    return res.render("login", { error_message: "Please log in to access this page" });
  }
  try {
    const departments = await db("departments").select();
    const isAdmin = req.session.role === "admin";
    const results = await db("department_medications as dm")
      .join("medications as m", "dm.medicationid", "m.medicationid")
      .select(
        "dm.departmentid",
        "m.medicationid",
        "m.medname",
        "m.quantityonhand",
        "m.image"
      );
    const departmentsWithMeds = departments.map(dept => {
      let items = results
        .filter(r => r.departmentid === dept.departmentid)
        .map(med => ({
          id: med.medicationid,
          medname: med.medname,
          quantityonhand: med.quantityonhand,
          image: med.image
        }));
      items = items.sort((a, b) => a.medname.localeCompare(b.medname));
      return { ...dept, items };
    });
    res.render("landing", { departments: departmentsWithMeds, isAdmin, role: req.session.role });
  } catch (err) {
    console.error("Error loading data:", err);
    res.render("landing", { departments: [], error_message: "Could not load departments.", role: req.session.role });
  }
});

// MANAGER VIEW


app.get("/managerView", async (req, res) => {
  if (!req.session.isLoggedIn) return res.render("login");
  if (req.session.role !== "admin") {
    req.session.error_message = "You do not have the credentials to view that page";
    return res.redirect("/landing");
  }
  try {
    const inventory = await db('medications').select().orderBy('medname');
    res.render("managerView", { inventory, role: req.session.role });
  } catch (err){
    console.error(err);
    res.status(500).send('Error retrieving inventory data');
  }
});

// MANAGER ADD
app.get("/managerView/add", async (req, res) => {
  if (!req.session.isLoggedIn) {
      return res.render("login", { error_message: "Please log in" });
  }
  const isAdmin = req.session.role === "admin";
  if (!isAdmin) {
    req.session.error_message = "You do not have the credentials to view that page";
    return res.redirect("landing");
  }
  try {
    const columns = await db('medications').columnInfo();
    res.render("managerAdd", { columns, error_message: "", role: req.session.role });
  } catch (err) {
    console.error("Error fetching table columns:", err);
    res.status(500).send("Error loading add form");
  }
});

app.post("/managerView/add", upload.single('image'), async (req, res) => {
  if (!req.session.isLoggedIn) {
      return res.render("login", { error_message: "Please log in" });}
  const isAdmin = req.session.role === "admin";
  if (!isAdmin) {
    req.session.error_message = "You do not have the credentials to view that page";
    return res.redirect("landing");
  }
  try {
    const columns = await db('medications').columnInfo();
    let insertData = {};
    Object.keys(columns).forEach(col => {
      if (col === 'medicationid') return;
      if (col === 'image') {
        insertData[col] = req.file ? '/images/' + req.file.filename : null;
      } else {
        insertData[col] = req.body[col] || null;
      }
    });
    await db('medications').insert(insertData);
    res.redirect("/managerView");
  } catch (err) {
    console.error("Error adding medication:", err);
    res.status(500).send("Error adding medication");
  }
});

// MANAGER EDIT
app.get("/managerView/edit/:medicationid", async (req, res) => {
  if (!req.session.isLoggedIn) return res.render("login", { error_message: "Please log in" });
  const isAdmin = req.session.role === "admin";
  if (!isAdmin) {
    req.session.error_message = "You do not have the credentials to view that page";
    return res.redirect("landing");
  }
  try {
    const item = await db("medications")
      .where({ medicationid: req.params.medicationid })
      .first();
    if (!item) {
      const inventory = await db('medications').select().orderBy('medname');
      return res.status(404).render("managerView", { inventory, error_message: "Item not found.", role: req.session.role });
    }
    const columns = await db('medications').columnInfo();
    res.render("managerEdit", { item, columns, error_message: "", role: req.session.role }); // <-- FIXED
  } catch (err) {
    console.error("Error fetching item:", err);
    const inventory = await db('medications').select().orderBy('medname');
    res.status(500).render("managerView", { inventory, error_message: "Unable to load item for editing.", role: req.session.role });
  }
});

app.post("/managerView/edit/:medicationid", upload.single("image"), async (req, res) => {
  if (!req.session.isLoggedIn) {
    return res.render("login", { error_message: "Please log in" });
  }

  const isAdmin = req.session.role === "admin";
  if (!isAdmin) {
    req.session.error_message = "You do not have the credentials to view that page";
    return res.redirect("landing");
  }

  const medicationid = req.params.medicationid;
  let updateData = { ...req.body };

  // Copy form data
  let updateData = { ...req.body };

  // Handle image
  if (req.file) {
    updateData.image = "/images/" + req.file.filename;
  } else {
    updateData.image = req.body.existingImage || null;
  }

  // Remove non-DB fields
  delete updateData.existingImage;

  // Convert numeric fields to proper types
  const numericFields = [
    "quantityonhand",
    "minquantity",
    "price",
    "meatwithhold",
    "milkwithhold",
    "vendorid"
  ];

  numericFields.forEach(field => {
    if (updateData[field] === "") {
      // optional numeric fields → null
      updateData[field] = null;
    } else if (updateData[field] !== undefined) {
      // parse as int or float
      updateData[field] = field === "price" ? parseFloat(updateData[field]) : parseInt(updateData[field]);
    }
  });

  try {
    await db("medications")
      .where({ medicationid })
      .update(updateData);
    res.redirect("/managerView");
  } catch (err) {
    console.error("Error updating medication:", err);
    res.status(500).send("Error updating medication");
  }
});




app.post("/managerView/delete/:medicationid", async (req, res) => {
  if (!req.session.isLoggedIn) return res.render("login", { error_message: "Please log in" });
  const isAdmin = req.session.role === "admin";
  if (!isAdmin) {
    req.session.error_message = "You do not have the credentials to view that page";
    return res.redirect("landing");
  }
  try {
    await db("department_medications").where({ medicationid: req.params.medicationid }).del();
    await db("treatment_medications").where({ medicationid: req.params.medicationid }).del();
    await db("medications").where({ medicationid: req.params.medicationid }).del();
    res.redirect("/managerView");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting medication");
  }
});

app.post('/checkout', express.json(), async (req, res) => {
  const checkouts = Array.isArray(req.body?.items) ? req.body.items : [];
  if (checkouts.length === 0) {
    return res.status(400).json({ success: false, message: 'No items provided.' });
  }
  try {
    await db.transaction(async (trx) => {
      for (const rawItem of checkouts) {
        const medicationId = rawItem?.medicationid;
        const quantity = Number(rawItem?.quantity);
        if (!medicationId || !Number.isInteger(quantity) || quantity <= 0) {
          throw { status: 400, message: 'Each item must include a medicationid and a positive quantity.' };
        }
        const updated = await trx('medications')
          .where('medicationid', medicationId)
          .andWhere('quantityonhand', '>=', quantity)
          .update({
            quantityonhand: trx.raw('quantityonhand - ?', [quantity]),
          });
        if (updated === 0) {
          throw { status: 400, message: `Insufficient stock for medication ${medicationId}.` };
        }
      }
    });
    res.json({ success: true, message: 'Checkout successful!' });
  } catch (err) {
    const status = err?.status || 500;
    const message = err?.message || 'Checkout failed!';
    console.error('Checkout error:', err);
    res.status(status).json({ success: false, message });
  }
});

app.listen(port, () => {
    console.log("The server is listening");
    console.log(`Server running on http://localhost:${port}`);
})
