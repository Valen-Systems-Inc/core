import Ajv2020 from "ajv/dist/2020.js";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractsDir = path.join(root, "contracts");
const fixturesDir = path.join(root, "proof/fixtures");
const ajv = new Ajv2020({ allErrors: true, strict: false });
const findings = [];

const schemaFiles = (await readdir(contractsDir))
  .filter((file) => file.endsWith(".schema.json"))
  .sort();

for (const file of schemaFiles) {
  const schemaPath = path.join(contractsDir, file);
  try {
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    ajv.addSchema(schema, schema.$id || file);
  } catch (error) {
    findings.push(`${file}: invalid JSON schema: ${message(error)}`);
  }
}

const validations = [
  ["get-cards.response.schema.json", "get-cards.response.local.json"],
  ["runtime-status.schema.json", "get-runtime-status.response.local.json"],
  ["process-card-action.request.schema.json", "process-card-action.keep.request.json"],
  ["process-card-action.request.schema.json", "process-card-action.dismiss.request.json"],
  ["process-card-action.response.schema.json", "process-card-action.keep.response.local.json"],
  ["process-card-action.response.schema.json", "process-card-action.dismiss.response.local.json"]
];

for (const [schemaFile, fixtureFile] of validations) {
  const schema = JSON.parse(await readFile(path.join(contractsDir, schemaFile), "utf8"));
  const validate = ajv.getSchema(schema.$id || schemaFile) || ajv.compile(schema);
  const fixture = JSON.parse(await readFile(path.join(fixturesDir, fixtureFile), "utf8"));
  if (!validate(fixture)) {
    findings.push(`${fixtureFile} does not match ${schemaFile}: ${ajv.errorsText(validate.errors)}`);
  }
}

if (findings.length) {
  console.error(findings.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  contracts: schemaFiles.length,
  fixtures: validations.length
}, null, 2));

function message(error) {
  return error instanceof Error ? error.message : String(error);
}
