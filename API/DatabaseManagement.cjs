const express = require('express');
const cors = require('cors');
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const mysql = require('mysql2/promise');

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

app.use(cors());

app.use(express.json());

//Load Entries Endpoint.


//Load Projects Endpoint.


//Create Entry Endpoint.


//Create Project Endpoint.


//Update Entry Endpoint. Also functions as soft delete.


//Update Project Endpoint. Also functions as soft delete.


//---User Endpoints That I'm Not Sure If We'll Use---


//Load Users?


//Create User?


//update User?