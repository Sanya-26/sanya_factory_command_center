const fs = require("node:fs");
const env = fs.readFileSync(__dirname + "/../.env", "utf8");
const pw = (env.match(/^VITE_DEV_ADMIN_PASSWORD=(.*)$/m) || [])[1] || "";
console.log("length:", pw.length);
console.log("has_lower:", /[a-z]/.test(pw));
console.log("has_upper:", /[A-Z]/.test(pw));
console.log("has_digit:", /[0-9]/.test(pw));
console.log("has_special:", /[^A-Za-z0-9]/.test(pw));
