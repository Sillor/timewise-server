const express = require('express');
const cors = require('cors');
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const mysql = require('mysql2/promise');
const logger = require("./loggerMiddleware.cjs");
const cookieParser = require("cookie-parser")
const { sendConfirmation } = require("../Mailer/Mailer.cjs");
const app = express();

require('dotenv').config();

const port = process.env.PORT1;

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

app.use(async function (req, res, next) {
    try {
        req.db = await pool.getConnection();
        req.db.connection.config.namedPlaceholders = true;

        await req.db.query(`SET SESSION sql_mode = "TRADITIONAL"`);
        await req.db.query(`SET time_zone = '-8:00'`);

        await next();

        req.db.release();
    } catch (err) {
        console.log(err);

        if (req.db) req.db.release();
        throw err;
    }
});

app.use(express.json());

app.use(cookieParser());

app.use(cors({
  origin: `http://localhost:${process.env.CLIENT_PORT}`,
  credentials: true,
}));

app.use((req, res, next) => {
    res.secureCookie = (name, val, options = {}) => {
        res.cookie(name, val, {
            sameSite: "strict",
            httpOnly: true,
            secure: true,
            ...options,
        });
    };
    next();
});

// Create Account Call. Makes a new account and returns a jwt token
app.post("/register",
    async function (req, res) {
        try {
            // Duplicate Email Check
            const dupeCheckEmail = req.body.email;

            const [testDupes] = await req.db.query(
                `SELECT * FROM users WHERE email = :dupeCheckEmail AND deleted = 0;`, {
                dupeCheckEmail,
            })

            if (testDupes.length) {
                await logger(req, req.body.email, "register", "users", null, false)

                res.status(409).json({ "success": false, "message": "Email already in use" });
                return
            }

            // Password Validation
            if (!validatePassword(req.body.password)) {
                await logger(req, req.body.email, "register", "users", null, false)

                res.status(400).json({ "success": false, "message": "Password must be at least 12 characters long, contain a special character, and not be a common password." });
                return;
            }

            // Password Encryption
            const hashPW = await bcrypt.hash(req.body.password, 10);
            const user = { "email": req.body.email, "hashedPW": hashPW };

            // Inserting new user into db
            await req.db.query('INSERT INTO users (email, hashedPW, deleted) VALUES (:email, :password, 0)', {
                email: user.email,
                password: user.hashedPW,
            });

            const accessToken = jwt.sign(user, process.env.JWT_KEY);

            const [[NewID]] = await req.db.query(`SELECT * FROM users WHERE email = :Email`,
                {
                    "Email": req.body.email
                }
            );

            await logger(req, req.body.email, "register", "users", NewID.ID, true)
            
            res.secureCookie("token", accessToken)

            res.status(201).json({ "success": true })
        } catch (error) {
            console.log(error);
            res.status(500).send("An error has occurred");
        }
    }
);

// Login Account Call. Checks if a username and pass exist in database. If so, returns a jwt token
app.post("/login",
    async function (req, res) {
        try {
            // Find User in DB
            const [[user]] = await req.db.query('SELECT * FROM users WHERE email = :email AND deleted = 0', { email: req.body.email });

            // Password Validation
            const compare = user && validatePassword(req.body.password) && await bcrypt.compare(req.body.password, user.hashedPW);
            if (!compare) {

                await logger(req.body.email, "login", "users", null, false)

                res.status(401).json({ "success": false, "message": "Incorrect username or password." });
                return;
            }

            const accessToken = jwt.sign({ "email": user.email, "hashedPW": user.hashedPW }, process.env.JWT_KEY);

            const [[NewID]] = await req.db.query(`SELECT * FROM users WHERE email = :Email`,
                {
                    "Email": req.body.email
                }
            );

            await logger(req, req.body.email, "login", "users", NewID.ID, true)

            res.secureCookie("token", accessToken)

            res.status(200).json({ "success": true, "token": accessToken })
        } catch (error) {
            console.log(error);
            res.status(500).send("An error has occurred");
        }
    }
);

// Reset password endpoint. Creates a link with a jwt that can be used to find the email/value pair.
app.post("/reset", async function (req, res) {
    const [[user]] = await req.db.query('SELECT * FROM users WHERE email = :email AND deleted = 0', { email: req.body.email });

    if (!user) {
        res.status(404).json({ "success": false, "message": "No user found with that email address." });
        return;
    }

    const accessToken = jwt.sign({ "email": user.email }, process.env.JWT_KEY2, { expiresIn: '1h' });
    const link = `http://localhost:${process.env.CLIENT_PORT}/reset-password?email=${user.email}&token=${accessToken}`;

    await sendConfirmation(user.email, link);

    const [[NewID]] = await req.db.query(`SELECT * FROM users WHERE email = :Email`,
    {
        "Email": req.body.email
    }
);

await logger(req, req.body.email, "resetPW", "users", NewID.ID, true)
    
    res.json({ "success": true, "message": `Link sent to ${user.email}` });
});

app.post('/reset-confirm', async function (req, res) {
    const token = req.body.token;
    const newPassword = req.body.password;

    try {
        const decoded = jwt.verify(token, process.env.JWT_KEY2);
        const email = decoded.email;

        // Password Validation
        if (!validatePassword(newPassword)) {

            const [[NewID]] = await req.db.query(`SELECT * FROM users WHERE email = :Email`,
                {
                    "Email": email
                }
            );

            await logger(req, email, "resetPW-Confirm", "users", NewID.ID, false)

            res.status(400).json({ "success": false, "message": "Password must be at least 12 characters long, contain a special character, and not be a common password." });
            return;
        }

        // Password Encryption
        const hashPW = await bcrypt.hash(newPassword, 10);

        // Inserting new user into db
        await req.db.query('UPDATE users SET hashedPW = :password WHERE email = :email', {
            email: email,
            password: hashPW,
        });

        const [[NewID]] = await req.db.query(`SELECT * FROM users WHERE email = :Email`,
            {
                "Email": email
            }
        );

        await logger(req, email, "resetPW-Confirm", "users", NewID.ID, true)

        res.status(200).json({ "success": true, "message": "Password has been changed." })
    } catch (error) {
        console.log(error);
        res.status(500).send("An error has occurred");
    }
});

app.post("/logout", async function(req, res) {
  res.clearCookie("token")
  res.sendStatus(200)
})

function validatePassword(password) {
    const lengthCheck = password.length >= 12;
    const specialCheck = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(password);
    const forbiddenList = ['password', '123', '1234', '12345', '123456'];
    const forbiddenCheck = !forbiddenList.includes(password.toLowerCase());

    return lengthCheck && specialCheck && forbiddenCheck;
}

app.listen(port, () => console.log(`Userdata Server listening on http://localhost:${port}`));