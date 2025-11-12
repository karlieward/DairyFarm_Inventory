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
        user : process.env.DB_USER,
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

app.use((req, res => {
    if (req.path === '/' || req.path === '/login' || req.path === '/logout') {return next();}
    if (req.session.isLoggedIn) {res.render('landing');}
    else {res.render('login', { error_message: "Please log in to access this page"});} 
}));

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

app.get("/landing", (req, res) => {
  if (req.session.isLoggedIn) {
    res.render("landing");
  } else {
    res.render("login", { error_message: "Please log in to access this page" });
  }
});

app.listen(port, () => {
    console.log("The server is listening");
    console.log(`Server running on http://localhost:${PORT}`);
})
