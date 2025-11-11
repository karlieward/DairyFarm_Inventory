require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
let bodyParser = require('body-parser');
const port = process.env.PORT || 3000;

let app = express();

app.set('view engine', 'ejs');
app.use('/images', express.static(path.join(__dirname, 'images')));








app.listen(

)