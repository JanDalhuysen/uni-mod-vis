import re
import os

def get_year_level(module_code):
    if not module_code:
        return "Unknown Year"
    first_digit = module_code[0]
    mapping = {
        '1': 'First Year',
        '2': 'Second Year',
        '3': 'Third Year',
        '4': 'Fourth Year',
        '5': 'Fifth Year',
        '6': 'Sixth Year',
        '7': 'Honours',
        '8': 'Masters'
    }
    return mapping.get(first_digit, "Other")

def clean_text(text):
    # Remove excessive newlines
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Remove page numbers and "Science" or "Division: ..." if they appear as standalone lines
    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        l = line.strip()
        if re.match(r'^\d+$', l): continue # Page number
        if l == "Science": continue
        if l.startswith("Division:"): continue
        cleaned_lines.append(line)

    text = '\n'.join(cleaned_lines).strip()

    # Remove double newlines in bulleted lists
    text = re.sub(r'(\n\s*-\s.*)\n+(\s*-)', r'\1\n\2', text)

    return text

def parse_prerequisites(text):
    # This is a bit tricky as the raw format uses italics and bullets
    # _Prerequisite module:_ or _Prerequisite pass modules:_
    # We want to convert them to **Prerequisite modules:** etc.

    text = re.sub(r'_Prerequisite module:_', r'**Prerequisite modules:**', text, flags=re.IGNORECASE)
    text = re.sub(r'_Prerequisite modules:_', r'**Prerequisite modules:**', text, flags=re.IGNORECASE)
    text = re.sub(r'_Prerequisite pass module:_', r'**Prerequisite pass modules:**', text, flags=re.IGNORECASE)
    text = re.sub(r'_Prerequisite pass modules:_', r'**Prerequisite pass modules:**', text, flags=re.IGNORECASE)
    text = re.sub(r'_Corequisite module:_', r'**Corequisite modules:**', text, flags=re.IGNORECASE)
    text = re.sub(r'_Corequisite modules:_', r'**Corequisite modules:**', text, flags=re.IGNORECASE)

    # Clean up logical connectors
    text = re.sub(r'_(AND|OR)_', r'\1', text, flags=re.IGNORECASE)

    # Remove italics and extra indentation from the module names in the lists
    text = re.sub(r'^\s+-\s+_(.*?)_', r'- \1', text, flags=re.MULTILINE)
    text = re.sub(r'^\s+-\s+(.*)', r'- \1', text, flags=re.MULTILINE)

    return text

def process_file(input_path):
    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split by subject
    # Subjects look like: ## **18139 Computer Science**
    subjects = re.split(r'## \*\*(\d{5} .*?)\*\*', content)

    if len(subjects) <= 1:
        # Try another pattern if the first one fails
        subjects = re.split(r'## \*\*(.*?)\*\*', content)

    # The first element is usually preamble
    preamble = subjects[0]

    parsed_subjects = []
    for i in range(1, len(subjects), 2):
        subject_name = subjects[i].strip()
        subject_content = subjects[i+1]

        # Modules look like: **113 (16) Computer Science for Actuarial Studies (3L, 3P)**
        # Or **472 (40) Data Science Research Project**
        module_pattern = r'\*\*(\d{3}) \((\d+)\) (.*?)\*\*'
        modules = re.split(module_pattern, subject_content)

        subject_data = {
            'name': subject_name,
            'years': {}
        }

        for j in range(1, len(modules), 4):
            m_code = modules[j].strip()
            m_credits = modules[j+1].strip()
            m_name_raw = modules[j+2].strip()
            m_body = modules[j+3] if j+3 < len(modules) else ""

            year = get_year_level(m_code)
            if year not in subject_data['years']:
                subject_data['years'][year] = []

            m_full_name = f"{m_code} ({m_credits}) {m_name_raw}"

            # Clean body
            m_body = clean_text(m_body)
            m_body = parse_prerequisites(m_body)

            subject_data['years'][year].append({
                'header': m_full_name,
                'body': m_body
            })

        parsed_subjects.append(subject_data)

    return parsed_subjects

def write_subjects(subjects, output_dir):
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    for subject in subjects:
        filename = f"all_{subject['name'].lower().replace(' ', '_')}_modules.md"
        # Remove the code from filename if present
        filename = re.sub(r'all_\d{5}_', 'all_', filename)

        filepath = os.path.join(output_dir, filename)

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(f"# {subject['name']}\n\n")

            # Sort years? Maybe not necessary if they appear in order
            year_order = ['First Year', 'Second Year', 'Third Year', 'Fourth Year', 'Honours', 'Masters']
            available_years = sorted(subject['years'].keys(), key=lambda x: year_order.index(x) if x in year_order else 99)

            for year in available_years:
                f.write(f"## {year}\n\n")
                for module in subject['years'][year]:
                    f.write(f"### {module['header']}\n\n")
                    f.write(f"{module['body']}\n\n")

if __name__ == "__main__":
    # subjects = process_file('raw_from_pdf.md')
    subjects = process_file('126-163-2026-science-yearbook-part.md')
    write_subjects(subjects, 'all_modules_new')
    print(f"Processed {len(subjects)} subjects.")
