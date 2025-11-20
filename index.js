require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');
const port = process.env.PORT || 3000;

const knex = require("knex")({
    client: "pg",
    connection: {
        host : process.env.DB_HOST,
        user : process.env.DB_USERNAME,
        password : process.env.DB_PASSWORD,
        database : process.env.DB_NAME,
        port : process.env.DB_PORT
    }
});

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

    knex.select("username", "password", "role")
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
    .catch(err => {  //zThis is exxception handling
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
