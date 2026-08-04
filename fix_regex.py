import re

with open('app/services/metadata_search.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the specific re.sub calls
target1 = r"re.sub(r'\s*\([^)]*\)', '', "
target2 = r"re.sub(r'\([^)]*\)$', '', "

content = content.replace(target1, "PAREN_RE.sub('', ")
content = content.replace(target2, "END_PAREN_RE.sub('', ")

# Add END_PAREN_RE definition if not present
if "END_PAREN_RE = re.compile" not in content:
    content = content.replace("PAREN_RE = re.compile(r' \([^)]*\)')", 
                              "PAREN_RE = re.compile(r' \([^)]*\)')\n    END_PAREN_RE = re.compile(r'\([^)]*\)$')")

# Fix whitespace issues around 218 and 273
# E303 too many blank lines (2) around 273 -> replace \n\n\n with \n\n
# W293 blank line contains whitespace -> replace ' \n' with '\n'
lines = content.split('\n')
for i in range(len(lines)):
    lines[i] = lines[i].rstrip()

# Write back
with open('app/services/metadata_search.py', 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
