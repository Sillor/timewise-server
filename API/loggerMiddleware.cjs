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