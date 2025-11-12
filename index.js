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
    if (req.session.isLoggedIn) {res.render('index');}
    else {res.render('login', { error_message: "Please log in to access this page"});} 
}));

app.get("/", (req, res) => {
    if (req.session.isLoggedIn) {        
        res.render("index");
    } 
    else {
      res.render("login", { error_message: "" });
    }
});



app.listen(port, () => {
    console.log("The server is listening");
    console.log(`Server running on http://localhost:${PORT}`);
})