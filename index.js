require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');
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
// Where to store uploaded images
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, uploadDir); // store in /images folder
    },
    filename: function(req, file, cb) {
        // Keep the filename
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });



let app = express();

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

app.use((req, res, next) => {
    if (req.path === '/' || req.path === '/login' || req.path === '/logout') {return next();}

    if (req.session.isLoggedIn) {return next();;}

    else {res.render('login', { error_message: "Please log in to access this page"});} 
});

app.get("/", (req, res) => {
    if (req.session.isLoggedIn) {        
        res.render("landing");
    } 
    else {
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
      // Check if a user was found with matching username AND password
      if (users.length > 0) {
        req.session.isLoggedIn = true;
        req.session.username = sName;
        req.session.role = users[0].role;
        res.redirect("/landing");
      } else {
        // No matching user found
        res.render("login", { error_message: "Invalid login" });
      }
    })
    .catch(err => {  // This is exception handling
      console.error("Login error:", err);
      res.render("login", { error_message: "Invalid login" });
    });

}); 

app.get("/logout", (req, res) => {
    // Get rid of the session object
    req.session.destroy((err) => {
        if (err) {
            console.log(err);
        }
        res.redirect("/");
    });
});

// note, the following was modified so that the users role is also passed to landing.ejs
// for conditional button rendering
//now "role" is included in the template data so the ejs page can check if the user is an admin
app.get("/landing", async (req, res) => {
  if (!req.session.isLoggedIn) {
    return res.render("login", { error_message: "Please log in to access this page" });
  }

  try {
    // 1. Get all departments (column: departmentid, departmentname)
    const departments = await knex("departments").select();

    // 2. Get all department-medication pairings with medication details
    const results = await knex("department_medications as dm")
      .join("medications as m", "dm.medicationid", "m.medicationid")
      .select(
        "dm.departmentid",
        "m.medicationid",
        "m.medname",
        "m.quantityonhand",
        "m.image"
      );

    // 3. Attach medications for each department
const departmentsWithMeds = departments.map(dept => {
  // Get medications for this department
  let items = results
    .filter(r => r.departmentid === dept.departmentid)
    .map(med => ({
      id: med.medicationid,
      medname: med.medname,
      quantityonhand: med.quantityonhand,
      image: med.image
    }));
  // Sort alphabetically by medname
  items = items.sort((a, b) => a.medname.localeCompare(b.medname));
  return { ...dept, items };
});


    res.render("landing", { departments: departmentsWithMeds, role:req.session.role }); // modded here to pass role for rendering
  } catch (err) {
    console.error("Error loading data:", err);
    res.render("landing", { departments: [], error_message: "Could not load departments." });
  }
});

app.get("/managerView", async (req, res) => {
  if (!req.session.isLoggedIn) {
    res.render("login");
  } 
  try {
    const inventory = await db('medications').select().orderBy('medname');
    res.render("managerView", { inventory });
  } catch (err){
    console.error(err);
    res.status(500).send('Error retrieving inventory data');
  }
});

app.post("/managerView/add", upload.single('image'), async (req, res) => {
  if (!req.session.isLoggedIn) return res.render("login", { error_message: "Please log in" });

  const { medname, quantity, category } = req.body;
  const imagePath = req.file ? '/images/' + req.file.filename : null;

  try {
    await db('medications').insert({ medname, quantity, category, image: imagePath });
    res.redirect("/managerView");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error adding medication");
  }
});

app.post("/managerView/edit/:id", upload.single('image'), async (req, res) => {
  if (!req.session.isLoggedIn) return res.render("login", { error_message: "Please log in" });

  const { id } = req.params;
  const { medname, quantity, category } = req.body;
  const updateData = { medname, quantity, category };

  if (req.file) {
    updateData.image = '/images/' + req.file.filename;
  }

  try {
    await db('medications').where({ id }).update(updateData);
    res.redirect("/managerView");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating medication");
  }
});



app.post("/managerView/delete/:id", async (req, res) => {
  if (!req.session.isLoggedIn) return res.render("login", { error_message: "Please log in" });

  const { id } = req.params;

  try {
    await db('medications').where({ id }).del();
    res.redirect("/managerView");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting medication");
  }
});



app.post('/checkout', express.json(), async (req, res) => {
  const checkouts = req.body.items; // medicationid and quantity
  try {
    for (const item of checkouts) {
      // Decrement inventory for each item (careful: do not allow < 0)
      await knex('medications')
        .where('medicationid', item.medicationid)
        .decrement('quantityonhand', item.quantity);
    }
    res.json({success: true, message: 'Checkout successful!'});
  } catch (err) {
    console.error(err);
    res.status(500).json({success: false, message: 'Checkout failed!'});
  }
});



app.listen(port, () => {
    console.log("The server is listening");
    console.log(`Server running on http://localhost:${port}`);
})
