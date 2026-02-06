const fs = require("fs");
const glob = require("glob");
const path = require("path");

function parseModules(pattern = "all_modules_new/all_*_modules.md") {
  const files = glob.sync(pattern);
  const allModules = {};

  files.forEach((file) => {
    const content = fs.readFileSync(file, "utf-8");
    let subject = "Unknown";

    // Try to guess subject from filename or content
    const filename = path.basename(file);
    if (filename.includes("computer_science")) subject = "Computer Science";
    else if (filename.includes("applied_mathematics")) subject = "Applied Mathematics";
    else if (filename.includes("mathematics")) subject = "Mathematics";
    else if (filename.includes("operations_research")) subject = "Operations Research";
    else if (filename.includes("git")) subject = "GIT"; // Geographical Information Technology?

    // Override if found in header
    const headerMatch = content.match(/^(?:#|Division:)\s*\d*\s*(.+)$/m);
    if (headerMatch) {
      subject = headerMatch[1].trim();
    }

    // Split by module headers
    // Regex to find start of module: (Start of line)(Optional ### )(3 Digits) (Credits) Name
    const moduleRegex = /(?:^|\n)(?:###\s*)?(\d{3})\s*\(\d+\)\s*(.+?)(?:\s*\(.*\))?\s*(?:\r?\n|$)/g;

    let match;
    let lastIndex = 0;
    const indices = [];

    while ((match = moduleRegex.exec(content)) !== null) {
      indices.push({
        index: match.index,
        code: match[1],
        name: match[2].trim(),
        fullMatch: match[0],
      });
    }

    indices.forEach((item, i) => {
      const nextItem = indices[i + 1];
      const end = nextItem ? nextItem.index : content.length;
      const block = content.slice(item.index + item.fullMatch.length, end); // Start after the header

      const moduleData = {
        id: `${subject} ${item.code}`,
        subject: subject,
        code: item.code,
        name: item.name,
        prerequisites: [],
        corequisites: [],
        prerequisitePass: [],
      };

      // Helper to extract list from section
      const extractList = (regex) => {
        const sectionMatch = block.match(regex);
        if (!sectionMatch) {
          return [];
        }
        const listText = sectionMatch[1];
        // Extract items starting with dash (-)
        const items = [];
        const dashRegex = /-\s*(.+?)(?=\r?\n|$)/g;
        let dMatch;
        while ((dMatch = dashRegex.exec(listText)) !== null) {
          const text = dMatch[1].trim();
          if (text) {
            items.push(text);
          }
        }
        return items;
      };

      // Regexes for different sections.
      // Now using consistent **bold** formatting: **Prerequisite modules:**
      // This makes parsing more reliable and consistent

      // Prerequisite modules
      // Matches "**Prerequisite module(s):**" with colon BEFORE closing asterisks
      // Use non-greedy matching to capture list until next section
      const prereqRegex = /\*\*Prerequisite modules?:\*\*\s*([\s\S]*?)(?=\*\*|###|$)/i;
      const coreqRegex = /\*\*Corequisite modules?:\*\*\s*([\s\S]*?)(?=\*\*|###|$)/i;
      const prePassRegex = /\*\*Prerequisite pass modules?:\*\*\s*([\s\S]*?)(?=\*\*|###|$)/i;

      moduleData.prerequisites = extractList(prereqRegex);
      moduleData.corequisites = extractList(coreqRegex);
      moduleData.prerequisitePass = extractList(prePassRegex);

      allModules[moduleData.id] = moduleData;
    });
  });

  return allModules;
}

module.exports = { parseModules };
