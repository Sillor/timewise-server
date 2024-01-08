const express = require('express');
const cors = require('cors');
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const app = express();

require('dotenv').config();

const port = process.env.PORT;

app.use(cors());

app.use(express.json());

app.post(
    "/register" , async function(req , res) {
        
    }
)