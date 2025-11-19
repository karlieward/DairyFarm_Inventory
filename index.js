require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
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
    if (req.path === '/' || req.path === '/login' || req.path === '/logout') {return next();}

    if (req.session.isLoggedIn) {return next();}

    else {return res.render('login', { error_message: "Please log in to access this page"});}
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


    res.render("landing", { departments: departmentsWithMeds });
  } catch (err) {
    console.error("Error loading data:", err);
    res.render("landing", { departments: [], error_message: "Could not load departments." });
  }
});

<<<<<<< Updated upstream
app.post('/checkout', express.json(), async (req, res) => {
  const checkouts = Array.isArray(req.body?.items) ? req.body.items : [];
  if (checkouts.length === 0) {
    return res.status(400).json({ success: false, message: 'No items provided.' });
=======
app.post('/checkout', async (req, res) => {
  const checkouts = req.body?.items;
  if (!Array.isArray(checkouts) || checkouts.length === 0) {
    return res.status(400).json({ success: false, message: 'No items to checkout.' });
>>>>>>> Stashed changes
  }

  try {
    await knex.transaction(async (trx) => {
<<<<<<< Updated upstream
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
=======
      for (const item of checkouts) {
        const medicationId = item?.medicationid;
        const quantity = Number(item?.quantity);

        if (!medicationId || !Number.isInteger(quantity) || quantity <= 0) {
          const validationError = new Error('Each checkout item requires a valid id and positive whole number quantity.');
          validationError.statusCode = 400;
          throw validationError;
        }

        const inventoryItem = await trx('medications')
          .where('medicationid', medicationId)
          .forUpdate()
          .first();

        if (!inventoryItem) {
          const notFoundError = new Error('Medication not found.');
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        if (inventoryItem.quantityonhand < quantity) {
          const insufficientError = new Error(`Insufficient quantity for ${inventoryItem.medname || 'the selected medication'}.`);
          insufficientError.statusCode = 400;
          throw insufficientError;
        }

        await trx('medications')
          .where('medicationid', medicationId)
          .decrement('quantityonhand', quantity);
>>>>>>> Stashed changes
      }
    });

    res.json({ success: true, message: 'Checkout successful!' });
  } catch (err) {
<<<<<<< Updated upstream
    const status = err?.status || 500;
    const message = err?.message || 'Checkout failed!';
    console.error('Checkout error:', err);
    res.status(status).json({ success: false, message });
=======
    const statusCode = err.statusCode || 500;
    if (statusCode >= 500) {
      console.error(err);
    }
    res.status(statusCode).json({
      success: false,
      message: err.message || 'Checkout failed!',
    });
>>>>>>> Stashed changes
  }
});



app.listen(port, () => {
    console.log("The server is listening");
    console.log(`Server running on http://localhost:${port}`);
})
