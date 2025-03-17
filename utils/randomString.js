const { randomBytes } = require("node:crypto");

function randomString(length = 8) {
  if (length % 2 !== 0) {
    length++;
  }

  return randomBytes(length / 2).toString("hex");
}

module.exports = randomString;
