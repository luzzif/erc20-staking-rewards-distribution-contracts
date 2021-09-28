const fs = require("fs");

const FOLDER_ROOT = `${__dirname}/../fuzzing/flattened`;
const REGEX = /\/\/.*SPDX-License-Identifier:.*\n*/g;

async function main() {
    const { license } = require("../package.json");
    fs.readdirSync(FOLDER_ROOT)
        .filter((fileName) => fileName !== ".gitkeep")
        .forEach((fileName) => {
            const filePath = `${FOLDER_ROOT}/${fileName}`;
            const fileContent = fs.readFileSync(filePath);
            const newFileContent = `// SPDX-License-Identifier: ${license}\n\n${fileContent
                .toString()
                .replace(REGEX, "")}`;
            fs.writeFileSync(filePath, newFileContent);
        });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
