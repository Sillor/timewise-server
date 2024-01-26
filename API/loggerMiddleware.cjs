const express = require('express');
const cors = require('cors');
const jwt = require("jsonwebtoken");
const mysql = require('mysql2/promise');

const app = express();

require('dotenv').config();

const port = process.env.PORT3;

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

app.get("/logs",
  async function (req, res) {
    try {
      const [serverLogs] = await req.db.query(
        `SELECT DateLogged , Email , Operation , TargetTable, TargetID FROM logs`
      )

      res.status(200).json({"success" : true , "data" : serverLogs})
    } catch (error) {
      console.log(error)
      res.status(500).send("An error has occurred")
    }
  }
)

async function logRequest(req , reqEmail , reqOperation , reqTable , reqTarget , reqSuccess) {

  try {
    req.db.query(
      `INSERT INTO logs (Email , Operation , TargetTable , TargetID , Success)
      VALUES (:Email , :Operation , :TargetTable , :TargetID , :Success)`,
      {
        "Email" : reqEmail,
        "Operation" : reqOperation,
        "TargetTable" : reqTable,
        "TargetID" : reqTarget,
        "Success" : reqSuccess
      }
    )

  } catch (error) {
    console.log("error with logger")
    console.log(error)
  }

}

module.exports = logRequest

app.listen(port, () => console.log(`Userdata Server listening on http://localhost:${port}`));