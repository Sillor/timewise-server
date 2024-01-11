const express = require('express');
const cors = require('cors');
const jwt = require("jsonwebtoken");
const mysql = require('mysql2/promise');

const app = express();

require('dotenv').config();

const port = process.env.PORT2;

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

//Authenticate Token Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token == null) { return res.sendStatus(401) };

  jwt.verify(token, process.env.JWT_KEY, (err, user) => {
    if (err) { console.log(err); return res.sendStatus(403) }
    req.user = user;
    next()
  })
}

app.use(authenticateToken);

//Load Entries Endpoint.
app.put("/loadEntries",
  async function (req, res) {
    try {
      //Retrieve UserId from Headers
      const targetID = await findUID(req.user, req);

      //Gets array of all entries that belong to a user
      const [entryList] = await req.db.query(
        `SELECT * FROM entries WHERE OwnerID = :targetID AND deleted = 0;`,
        {
          targetID
        }
      )

      res.status(200).json({ "success": true, "data": entryList })
    } catch (error) {
      console.log(error)
      res.status(500).send("An error has occurred")
    }
  }

)

//Load Projects Endpoint.
app.put("/loadProjects",
  async function (req, res) {
    try {
      //Retrieve UserId from Headers
      const targetID = await findUID(req.user, req);

      //Gets array of all entries that belong to a user
      const [entryList] = await req.db.query(
        `SELECT * FROM projects WHERE OwnerID = :targetID AND deleted = 0;`,
        {
          targetID
        }
      )

      res.status(200).json({ "success": true, "data": entryList })
    } catch (error) {
      console.log(error)
      res.status(500).send("An error has occurred")
    }
  }

)

//Create Entry Endpoint.
app.put("/createEntry",
  async function (req, res) {
    try {
      //Retrieve UserId from Headers
      const targetID = await findUID(req.user, req);

    } catch (error) {
      console.log(error)
      res.status(500).send("An error has occurred")
    }
  }

)

//Create Project Endpoint.
app.put("/createProject",
  async function (req, res) {
    try {
      //Retrieve UserId from Headers
      const targetID = await findUID(req.user, req);

      await req.db.query(
        `INSERT INTO projects (ProjectName , OwnerID , deleted)
        VALUES (:projectName , :OwnerID , false)`,
        {
          "projectName": req.body.projectName,
          "OwnerID": targetID
        }
      );
      res.status(200).json({ "success": true})
    } catch (error) {
      console.log(error)
      res.status(500).send("An error has occurred")
    }
  }

)

//Update Entry Endpoint. Also functions as soft delete.
app.put("/updateEntry",
  async function (req, res) {
    try {
      //Retrieve UserId from Headers
      const targetID = await findUID(req.user, req);

    } catch (error) {
      console.log(error)
      res.status(500).send("An error has occurred")
    }
  }

)

//Update Project Endpoint. Also functions as soft delete.
app.put("/updateProject",
  async function (req, res) {
    try {
      //Retrieve UserId from Headers
      const targetID = await findUID(req.user, req);

    } catch (error) {
      console.log(error)
      res.status(500).send("An error has occurred")
    }
  }

)

//---User Endpoints That I'm Not Sure If We'll Use---


//Load Users?


//Create User?


//update User?


//functions

async function findUID(userObj, req) {
  const [[queriedUser]] = await req.db.query(
    `SELECT * FROM users WHERE email = :userEmail AND hashedPW = :userPW AND deleted = 0`,
    {
      "userEmail": userObj.email,
      "userPW": userObj.hashedPW
    }
  );
  return queriedUser.ID
}

app.listen(port, () => console.log(`Userdata Server listening on http://localhost:${port}`));