#!/usr/bin/env node

import fs from "fs"
import program from "commander"
import generatePythonStr from "./generatePythonStr"

program
  .option("-s, --schema <path>", "the path to your schema file")
  .option("-o, --out <path>", "the path to generated python code [gen.py]")
  .parse(process.argv)

if (!program.schema) {
  throw new Error("No schema file specified.")
}

const schemaDocument = fs.readFileSync(program.schema)
const schemaString = schemaDocument.toString()

const outStr = generatePythonStr(schemaString)

let outFilePath = "./gen.py"
if (typeof program.out === "string") {
  outFilePath = program.out
}

fs.writeFile(outFilePath, outStr, err => {
  if (err) throw err
  else console.log(`Wrote file at ${outFilePath}`)
})
