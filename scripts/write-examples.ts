import { mkdirSync, writeFileSync } from "node:fs";
import { demoFiles } from "../src/domain/demo";

const files = demoFiles();
for (const dir of ["examples", "public/examples"]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${files.scheduleName}`, files.schedule);
  writeFileSync(`${dir}/${files.calendarName}`, files.calendar);
}
console.log(`записаны ${files.scheduleName} и ${files.calendarName}`);
