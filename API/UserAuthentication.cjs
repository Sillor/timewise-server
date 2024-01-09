const express = require('express');
const cors = require('cors');
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const app = express();

require('dotenv').config();

const port = process.env.PORT1;

app.use(cors());

app.use(express.json());

//Create Account Call. Makes a new account and returns a jwt token
app.post("/register",
    async function (req, res) {
        try {
            //To do: Add duplicate check for email in database

            //To do

            const hashPW = await bcrypt.hash(req.body.password, 10)
            const user = { "email": req.body.email, "password": hashPW }

            //To do: Add SQL insert into database with hashed password

            //To do

            const accessToken = jwt.sign(user, process.env.JWT_KEY);

            res.status(200).json({ "success": true, "token": accessToken })
        } catch (error) {
            console.log(error)
            res.status(500).send("An error has occurred")
        }
    }
)

//Login Account Call. Checks if a username and pass exist in database. If so, returns a jwt token
app.post("/login",
    async function (req, res) {
        try {
            //To do: Add SQL search for matching email, since email will be a unique identifier

            //To do

            const foundCombo = {"email" : "xxx" , "password" : "xxx"}

            if (!bcrypt.compare(foundCombo.password , req.body.password)) {
                res.status().send("Incorrect username or password.")
            }

        } catch (error) {
            console.log(error)
            res.status(500).send("An error has occurred")
        }
    }
)

app.listen(port, () => console.log(`Userdata Server listening on http://localhost:${port}`));