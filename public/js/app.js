document.addEventListener("DOMContentLoaded", () => {
  mermaid.initialize({ startOnLoad: false });

  let allModules = {};
  const modulesList = document.getElementById("modules-list");
  const targetSelect = document.getElementById("target-modules");
  const visualizeBtn = document.getElementById("visualize-btn");
  const graphContainer = document.getElementById("graph-container");
  const statusMessage = document.getElementById("status-message");

  // Fetch Data
  fetch("/api/modules")
    .then((res) => res.json())
    .then((data) => {
      allModules = data;
      initUI();
    })
    .catch((err) => {
      console.error(err);
      modulesList.innerHTML = '<p class="error">Failed to load modules.</p>';
    });

  function initUI() {
    modulesList.innerHTML = "";
    targetSelect.innerHTML = "";

    // Group by Subject
    const grouped = {};
    Object.values(allModules).forEach((m) => {
      if (!grouped[m.subject]) grouped[m.subject] = [];
      grouped[m.subject].push(m);
    });

    // Populate List (Sort by Code)
    Object.keys(grouped)
      .sort()
      .forEach((subject) => {
        const groupDiv = document.createElement("div");
        groupDiv.className = "module-group";
        groupDiv.innerHTML = `<h4>${subject}</h4>`;

        grouped[subject]
          .sort((a, b) => a.code.localeCompare(b.code))
          .forEach((m) => {
            // Sidebar Item
            const item = document.createElement("div");
            item.className = "module-item";
            item.innerHTML = `
                    <label style="flex:1; font-size:0.9em;">
                        <strong>${m.code}</strong>
                    </label>
                    <select id="status-${cleanId(m.id)}" data-id="${m.id}" class="status-select">
                        <option value="passed">Passed (>=50)</option>
                        <option value="condoned">Failed (40-49)</option>
                        <option value="failed">Failed (<40)</option>
                        <option value="none">Not Taken</option>
                    </select>
                `;
            groupDiv.appendChild(item);

            // Target Option
            const option = document.createElement("option");
            option.value = m.id;
            option.textContent = `${m.id} - ${m.name}`;
            targetSelect.appendChild(option);
          });
        modulesList.appendChild(groupDiv);
      });
  }

  visualizeBtn.addEventListener("click", () => {
    const selectedOptions = Array.from(targetSelect.selectedOptions).map((o) => o.value);
    if (selectedOptions.length === 0) {
      statusMessage.textContent = "Please select at least one target module.";
      return;
    }
    renderGraph(selectedOptions);
  });

  function renderGraph(targetIds) {
    const nodes = new Set();
    const edges = [];
    const queue = [...targetIds];
    const visited = new Set();
    const processedEdges = new Set();

    while (queue.length > 0) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      nodes.add(id);

      const mod = allModules[id];
      if (!mod) continue;

      const addDeps = (deps, type) => {
        deps.forEach((depStr) => {
          const mentionedIds = findAllModulesInString(depStr);
          mentionedIds.forEach((sourceId) => {
            const edgeKey = `${sourceId}->${id}`;
            if (!processedEdges.has(edgeKey)) {
              edges.push({ from: sourceId, to: id, type: type });
              processedEdges.add(edgeKey);
              if (!visited.has(sourceId)) {
                queue.push(sourceId);
              }
            }
          });
        });
      };

      addDeps(mod.prerequisitePass, "prereqPass");
      addDeps(mod.prerequisites, "prereq");
      addDeps(mod.corequisites, "coreq");
    }

    // Generate Mermaid syntax
    let graphDef = "graph TD\n";

    const nodeDefinitions = [];
    const statusMap = getStatusMap();

    nodes.forEach((id) => {
      const mod = allModules[id];
      let status = "neutral";
      const userStatus = statusMap[id] || "none";

      const isTarget = targetIds.includes(id);

      // Check if blocked
      const blockedReasons = checkBlocked(id, statusMap);

      if (isTarget) {
        if (blockedReasons.length > 0) status = "locked";
        else status = "pending";
      } else {
        if (userStatus === "passed") status = "passed";
        else if (userStatus === "condoned") status = "failed";
        else if (userStatus === "failed") status = "failed";
        else status = "neutral";
      }

      const nid = cleanId(id);
      const label = mod ? `${mod.code}<br/>${mod.name}` : id;

      nodeDefinitions.push(`${nid}["${label}"]:::${status}`);

      if (blockedReasons.length > 0 && isTarget) {
        console.log(`${id} blocked by: ${blockedReasons.join(", ")}`);
      }
    });

    graphDef += nodeDefinitions.join("\n") + "\n";

    edges.forEach((e) => {
      const from = cleanId(e.from);
      const to = cleanId(e.to);
      let arrow = "-->";
      let label = "";

      if (e.type === "prereqPass") {
        arrow = "==>";
        label = "|Prereq Pass|";
      } else if (e.type === "coreq") {
        arrow = "-.->";
        label = "|Coreq|";
      }

      graphDef += `${from} ${arrow} ${label} ${to}\n`;
    });

    graphDef += "classDef passed fill:#28a745,color:white,stroke:#208637;\n";
    graphDef += "classDef failed fill:#dc3545,color:white,stroke:#a71d2a;\n";
    graphDef += "classDef pending fill:#007bff,color:white,stroke:#0056b3;\n";
    graphDef += "classDef locked fill:#6c757d,color:white,stroke:#545b62;\n";
    graphDef += "classDef neutral fill:#fff,stroke:#333;\n";

    statusMessage.textContent = "Graph updated.";
    renderMermaid(graphDef);
  }

  async function renderMermaid(def) {
    graphContainer.innerHTML = "";
    try {
      const id = "mermaid-graph-" + Math.floor(Math.random() * 10000);
      const { svg } = await mermaid.render(id, def);
      graphContainer.innerHTML = svg;
    } catch (e) {
      console.error("Mermaid error", e);
      statusMessage.textContent = "Error rendering graph";
      graphContainer.innerHTML = `<pre>${def}</pre>`;
    }
  }

  function checkBlocked(id, statusMap) {
    const mod = allModules[id];
    if (!mod) return [];
    const reasons = [];

    const checkRequirement = (depList, threshold) => {
      depList.forEach((depStr) => {
        const ids = findAllModulesInString(depStr);
        if (ids.length === 0) return;

        const isOr = depStr.toLowerCase().includes(" or ");

        if (isOr) {
          const anyPassed = ids.some((pid) => {
            const s = statusMap[pid];
            return s === "passed" || (threshold === 40 && s === "condoned");
          });
          if (!anyPassed) {
            reasons.push(`Missing one of: ${ids.join(", ")}`);
          }
        } else {
          ids.forEach((pid) => {
            const s = statusMap[pid];
            const passed = s === "passed" || (threshold === 40 && s === "condoned");
            if (!passed) {
              reasons.push(`${pid} missing`);
            }
          });
        }
      });
    };

    checkRequirement(mod.prerequisitePass, 50);
    checkRequirement(mod.prerequisites, 40);

    return reasons;
  }

  function findAllModulesInString(str) {
    const found = [];
    const regex = /((?:[A-Z][a-z]+\s*)+)?(\d{3})/g;
    let match;
    let lastSubject = null;

    while ((match = regex.exec(str)) !== null) {
      const subjectText = match[1] ? match[1].trim() : null;
      const code = match[2];

      let possibleId = null;

      if (subjectText) {
        const mappedSubject = resolveSubject(subjectText);
        if (mappedSubject) {
          lastSubject = mappedSubject;
          possibleId = `${mappedSubject} ${code}`;
        } else {
          // If we can't resolve the subject, try to find ANY module with this code
          console.warn(`Subject "${subjectText}" not found, searching for code ${code}`);
          const matchingModule = Object.values(allModules).find((m) => m.code === code);
          if (matchingModule) {
            possibleId = matchingModule.id;
            console.warn(`  -> Matched to: ${possibleId}`);
          }
        }
      } else if (lastSubject) {
        possibleId = `${lastSubject} ${code}`;
      }

      if (possibleId && allModules[possibleId]) {
        found.push(possibleId);
      } else if (possibleId) {
        console.warn(`Module not found: ${possibleId}`);
      }
    }

    return found;
  }

  function resolveSubject(text) {
    const subjects = new Set(Object.values(allModules).map((m) => m.subject));

    // Exact match first
    if (subjects.has(text)) return text;

    // Try case-insensitive exact match
    const textLower = text.toLowerCase();
    for (let s of subjects) {
      if (s.toLowerCase() === textLower) return s;
    }

    // Only match if text is the END of the subject (not the subject ending with text)
    // This prevents "Mathematics" from matching "Applied Mathematics"
    for (let s of subjects) {
      if (s.endsWith(text) && s !== text) {
        // Make sure it's a word boundary (space before)
        const prefix = s.substring(0, s.length - text.length);
        if (prefix.endsWith(" ")) {
          return s;
        }
      }
    }

    return null;
  }

  function cleanId(id) {
    return id.replace(/[^a-zA-Z0-9]/g, "_");
  }

  function getStatusMap() {
    const map = {};
    document.querySelectorAll(".status-select").forEach((sel) => {
      map[sel.dataset.id] = sel.value;
    });
    return map;
  }
});
