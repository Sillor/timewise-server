const express = require('express');
const cors = require('cors');
const jwt = require("jsonwebtoken");
const mysql = require('mysql2/promise');

const cookieParser = require("cookie-parser");
const logger = require("./loggerMiddleware.cjs");
const bcrypt = require("bcrypt");

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


app.use(express.json());

app.use(cookieParser())

app.use(cors({
  origin: `http://localhost:${process.env.CLIENT_PORT}`,
  credentials: true,
}));

//Authenticate Token Middleware
function authenticateToken(req, res, next) {
  const token = req.cookies.token
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
        `SELECT entries.LocalID as localID , entries.Summary as summary, entries.StartTime as start , entries.EndTime as end , projects.ProjectName as parentProject
        FROM entries LEFT JOIN projects on entries.ParentProjectID = projects.ID
        WHERE entries.OwnerID = :OwnerID AND entries.deleted = false`,
        {
          "OwnerID": targetID
        }
      )

      await logger(req, req.user.email, "loadEntries", "entries", targetID, true)

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
      const [entryList] = await req.db.query(// ChatGPT created query
        `SELECT
          projects.ProjectName as projectName,
          IFNULL(SEC_TO_TIME(SUM(CASE WHEN (entries.deleted = false OR entries.deleted IS NULL) THEN TIME_TO_SEC(entries.HoursSpent) ELSE 0 END)), '00:00:00') as totalTime
        FROM projects
        LEFT JOIN entries ON projects.ID = entries.ParentProjectID AND (entries.OwnerID = :OwnerID OR projects.OwnerID = :OwnerID)
        WHERE projects.OwnerID = :OwnerID
        GROUP BY projects.ID;
        `,
        {
          "OwnerID": targetID
        }
      )

      await logger(req, req.user.email, "loadProjects", "projects/entries", targetID, true)

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

      //Project ID finder function
      const [[targetProject]] = await req.db.query(
        `SELECT * FROM projects WHERE ProjectName = :ParentProjectName AND OwnerID = :OwnerID AND deleted = false;`,
        {
          "ParentProjectName": req.body.parentProject,
          "OwnerID": targetID
        }
      )
      const targetParentID = targetProject.ID

      //LocalID generator
      const newLocalID = Array.from(Array(254), () => Math.floor(Math.random() * 36).toString(36)).join('');

      const [testLID] = await req.db.query(`
      SELECT * FROM entries WHERE OwnerID = :OwnerId AND LocalID = :LocalID
      `,
        {
          "OwnerID": targetID,
          "LocalID": newLocalID
        })

      while (testLID.length) {//needs testing
        newLocalID = Array.from(Array(254), () => Math.floor(Math.random() * 36).toString(36)).join('')

        testLID = await req.db.quey(`
        SELECT * FROM entries WHERE OwnerID = :OwnerId AND LocalID = :LocalID
        `,
          {
            "OwnerID": targetID,
            "LocalID": newLocalID
          });
      }

      await req.db.query(
        `INSERT INTO entries (OwnerID , LocalID, ParentProjectID , Summary , StartTime , EndTime , deleted)
        VALUES (:OwnerID , :LocalID , :ParentProjectID , :Summary , :Start , :End , false);`,
        {
          "OwnerID": targetID,
          "LocalID": newLocalID,
          "Summary": req.body.summary,
          "ParentProjectID": targetParentID,
          "Start": req.body.start,
          "End": req.body.end
        }
      );

      const [[NewID]] = await req.db.query(`SELECT * FROM entries WHERE LocalID = :LocalID`,
        {
          "LocalID": newLocalID
        }
      );

      await logger(req, req.user.email, "createEntry", "entries", NewID.ID, true)

      res.status(200).json({ "success": true })
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

      //Project Duplicate Checker
      const [testDupes] = await req.db.query(
        `SELECT * FROM projects WHERE ProjectName = :ProjectName AND OwnerID = :OwnerID AND deleted = false;`, {
        "ProjectName": req.body.projectName,
        "OwnerID": targetID,
      })

      if (testDupes.length) {

        const [[NewID]] = await req.db.query(`SELECT * FROM projects WHERE ProjectName = :projectName AND OwnerID = :ownerID AND deleted = false`,
          {
            "projectName": req.body.projectName,
            "ownerID": targetID
          }
        );

        await logger(req, req.user.email, "createProject", "projects", NewID.ID, false)

        res.status(409).json({ "success": false, "message": "Project already exists" });
        return
      }

      //Add project to database
      await req.db.query(
        `INSERT INTO projects (ProjectName , OwnerID , deleted)
        VALUES (:projectName , :OwnerID , false)`,
        {
          "projectName": req.body.projectName,
          "OwnerID": targetID
        }
      );

      const [[NewID]] = await req.db.query(`SELECT * FROM projects WHERE ProjectName = :projectName AND OwnerID = :ownerID AND deleted = false`,
        {
          "projectName": req.body.projectName,
          "ownerID": targetID
        }
      );

      await logger(req, req.user.email, "createProject", "projects", NewID.ID, true)

      res.status(200).json({ "success": true })
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

      const updateDeleted = req.body.deleted === null ? false : req.body.deleted;

      const [[targetProject]] = await req.db.query(
        `SELECT * FROM projects WHERE ProjectName = :ParentProjectName AND OwnerID = :OwnerID AND deleted = false;`,
        {
          "ParentProjectName": req.body.parentProject,
          "OwnerID": targetID
        }
      )
      const targetParentID = targetProject.ID

      await req.db.query(
        `UPDATE entries
        SET Summary = :summary , StartTime = :start , EndTime = :end , ParentProjectID = :parentProjectID , deleted = :deleted
        WHERE OwnerID = :ownerID AND LocalID = :localID AND deleted = false`,
        {
          "ownerID": targetID,
          "localID": req.body.localID,
          "summary": req.body.summary,
          "start": req.body.start,
          "end": req.body.end,
          "parentProjectID": targetParentID,
          "deleted": updateDeleted
        }
      )
      res.status(200).json({ "success": true });

      const [[NewID]] = await req.db.query(`SELECT * FROM entries WHERE LocalID = :localID AND OwnerID = :ownerID`,
        {
          "localID": req.body.localID,
          "ownerID": targetID
        }
      );

      await logger(req, req.user.email, "updateEntry", "projects", NewID.ID, true)

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

      const updateDeleted = req.body.deleted ? req.body.deleted : false;

      const [testDupes] = await req.db.query( //TESTING NEEDED
        `SELECT * FROM projects WHERE ProjectName = :ProjectName AND OwnerID = :OwnerID AND deleted = false;`,
        {
          "ProjectName": req.body.projectNameNew,
          "OwnerID": targetID,
        })

      if (testDupes.length && req.body.deleted == undefined) {

        const [[NewID]] = await req.db.query(`SELECT * FROM projects WHERE ProjectName = :projectName AND OwnerID = :ownerID AND deleted = false`,
          {
            "projectName": req.body.projectNameNew,
            "ownerID": targetID
          }
        );

        await logger(req, req.user.email, "updateProject", "projects", NewID.ID, false)

        res.status(409).json({ "success": false, "message": "Project already exists" });
        return
      }

      await req.db.query(
        `UPDATE projects 
        SET ProjectName = :projectNameNew , deleted = :deleted
        WHERE ProjectName = :projectNameOld AND OwnerID = :OwnerID AND deleted = false;`,
        {
          "projectNameOld": req.body.projectNameOld,
          "projectNameNew": req.body.projectNameNew,
          "OwnerID": targetID,
          "deleted": updateDeleted
        }
      )

      if (updateDeleted == false) {
        const [[NewID]] = await req.db.query(`SELECT * FROM projects WHERE ProjectName = :projectName AND OwnerID = :ownerID AND deleted = false`,
          {
            "projectName": req.body.projectNameNew,
            "ownerID": targetID
          }
        );

        await logger(req, req.user.email, "updateProject", "projects", NewID.ID, true)
      }
      else {
        const [[NewID]] = await req.db.query(`SELECT * FROM projects WHERE ProjectName = :projectName AND OwnerID = :ownerID AND deleted = true`,
          {
            "projectName": req.body.projectNameNew,
            "ownerID": targetID
          }
        );

        await logger(req, req.user.email, "updateProject", "projects", NewID.ID, true)
      }

      res.status(200).json({ "success": true })
    } catch (error) {
      console.log(error)
      res.status(500).send("An error has occurred")
    }
  }

)

//---User Endpoints That I'm Not Sure If We'll Use---

//Load Users Endpoint
app.get("/loadUsers",
  async function (req, res) {
    try {
      //Retrieve UserId from Headers
      const targetID = await findUID(req.user, req);

      const [dataList] = await req.db.query(
        `SELECT ID, email FROM users WHERE deleted = false`
      );

      res.status(200).json({ "success": true, "data": dataList, "currentUserID": targetID})

    } catch (error) {
      console.log(error)
      res.status(500).send("An error has occurred")
    }
  }
)

//Create User Endpoint
app.post("/createUser",
  async function (req, res) {
    try {
      // Duplicate Email Check
      const dupeCheckEmail = req.body.email;

      const [testDupes] = await req.db.query(
          `SELECT * FROM users WHERE email = :dupeCheckEmail AND deleted = 0;`, {
          dupeCheckEmail
      });

      if (testDupes.length) {
          res.status(409).json({ "success": false, "message": "Email already in use" });
          return;
      }

      // Assign Default Password
      const password = "testingtime@default";

      // Password Encryption
      const hashPW = await bcrypt.hash(password, 10);
      const user = { "email": req.body.email, "hashedPW": hashPW };

      // Inserting new user into db
      await req.db.query('INSERT INTO users (email, hashedPW, deleted) VALUES (:email, :password, 0)', {
          email: user.email,
          password: user.hashedPW,
      });

      res.status(201).json({ "success": true });
    } catch (error) {
      console.log(error)
      res.status(500).send("An error has occurred")
    }
  }
)

//Delete User Endpoint
app.delete('/deleteUser/:id', async function(req, res) {
  try {
    // Retrieve user id from request
    const { id } = req.params;

    await req.db.query(
      `UPDATE users SET deleted = true WHERE ID = :id;`,
      {
        "id": id
      }
    )

    res.status(200).json({ success: true });
  } catch (error) {
    console.log(error);
    res.status(500).send("An error has occurred");
  }
});


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