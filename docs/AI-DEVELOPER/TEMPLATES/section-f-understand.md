# Section F: Task Understanding (Universal)

> **Purpose:** Understand the task before implementation
> **When:** Before writing any code
> **Works With:** Any language, framework, or project structure

---

## Instructions for AI Developer

Before implementing any task, complete ALL steps in this section. This ensures you understand what to build and how to build it correctly for THIS specific project.

---

## Step F.1: Read the Task Definition

**From the phase document, extract:**

```markdown
## Task Analysis

**Task ID:** [e.g., 5.1.1]
**Task Title:** [from phase doc]
**Session Type:** [Backend/Frontend/Database/Config/etc.]
**Estimated Time:** [from phase doc]

### Prerequisites
- [ ] [List prerequisite tasks]
- [ ] [Are they complete?]

### Deliverables
- [ ] [File 1 to create/modify]
- [ ] [File 2 to create/modify]

### Done Criteria
- [ ] [Criteria 1]
- [ ] [Criteria 2]
```

**Verify prerequisites are complete before proceeding.**

---

## Step F.2: Discover Project Structure

**First, understand the project you're working with:**

```bash
# What is this project?
cat README.md | head -50

# What language/framework? Look for config files:
ls -la
# Common indicators:
# - package.json → Node.js/JavaScript
# - requirements.txt, setup.py → Python
# - Cargo.toml → Rust
# - go.mod → Go
# - pom.xml, build.gradle → Java
# - Gemfile → Ruby
# - composer.json → PHP

# What's the project structure?
find . -type d -not -path '*/\.*' -not -path '*/node_modules/*' -not -path '*/venv/*' -not -path '*/__pycache__/*' -not -path '*/target/*' | head -30

# What are the main directories?
ls -la */
```

**Record what you discover:**
```markdown
### Project Discovery

**Primary Language:** [discovered from config files]
**Framework(s):** [discovered from dependencies]
**Source Directory:** [discovered from structure]
**Test Directory:** [discovered from structure]
**Build/Config Files:** [list them]
```

---

## Step F.3: Discover Code Patterns

**DO NOT assume patterns. DISCOVER them from existing code.**

### Find Similar Files

```bash
# Find files of the type you need to create
# Adjust extension based on discovered language
find . -type f -name "*.[ext]" | grep -v "node_modules\|venv\|target\|dist\|build" | head -20

# Find files with similar purpose
find . -type f -name "*[keyword]*" | head -10
```

### Read Existing Patterns

```bash
# Read a few existing files to understand patterns
head -50 [path/to/similar/file]

# See how imports are done
head -30 [any-source-file]

# See file structure patterns
cat [existing-similar-file]
```

### Document Discovered Patterns

```markdown
### Patterns Discovered

**File Naming:** [e.g., kebab-case, PascalCase, snake_case]
**Directory Structure:** [how files are organized]
**Import Style:** [relative, absolute, aliases]
**Code Organization:** [classes, functions, modules]
**Error Handling:** [pattern used]
**Logging:** [pattern used]
```

---

## Step F.4: Find Most Similar Code

**Find the code most similar to what you need to create:**

```bash
# Search by filename pattern
find . -name "*[similar-name]*" -type f 2>/dev/null | head -10

# Search by content pattern
grep -rln "[pattern]" [source-dir]/ 2>/dev/null | head -10

# Read the most similar file completely
cat [most-similar-file]
```

**Record:**
- Which file is most similar?
- What structure does it use?
- What can I copy/adapt?

---

## Step F.5: Identify Dependencies

```markdown
### Dependencies for This Task

**Internal Files (to import/use):**
- [ ] [file1] - [what to use from it]
- [ ] [file2] - [what to use from it]

**External Libraries:**
- [ ] [library1] - [already installed? need to add?]
- [ ] [library2]

**Configuration:**
- [ ] [config key or env var needed]

**Database/Storage (if applicable):**
- [ ] [model/table/collection name]
```

---

## Step F.6: Create Implementation Plan

**Based on discovered patterns, plan the work:**

```markdown
### Implementation Plan

1. **Step 1:** [Description]
   - File: [path - based on discovered structure]
   - Action: create / modify
   - Follow pattern from: [similar existing file]

2. **Step 2:** [Description]
   - File: [path]
   - Action: create / modify
   - Follow pattern from: [similar existing file]

3. **Step 3:** [Continue as needed]
```

---

## Step F.7: Understanding Checklist

Before proceeding to Section G:

- [ ] Task definition extracted
- [ ] Prerequisites verified complete
- [ ] Project language/framework discovered
- [ ] Project structure discovered
- [ ] Code patterns discovered (NOT assumed)
- [ ] Similar existing code found
- [ ] Dependencies identified
- [ ] Implementation plan created

---

## Output Format

```markdown
## Section F Complete: Task Understanding ✅

**Task:** [ID] - [Title]

### Project Discovered
- Language: [discovered]
- Framework: [discovered]
- Source Dir: [discovered]

### Patterns Discovered
- File naming: [pattern]
- Import style: [pattern]
- Code structure: [pattern]

### Similar Existing Code
- [file1] - Use as template for [what]
- [file2] - Use as reference for [what]

### Implementation Plan
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Ready for:** Section G (Implementation)
```

---

## Critical Rule: DISCOVER, DON'T ASSUME

❌ **WRONG (Assuming):** 
"React projects use src/components/, so I'll create the file there"

✅ **RIGHT (Discovering):**
"I found existing components in `app/ui/` using `.jsx` extension. I'll follow that pattern."

---

**End of Section F**
