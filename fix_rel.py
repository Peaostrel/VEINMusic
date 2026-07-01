import os, glob, re

for file in glob.glob('e:/VEIN/VEINMusic/frontend/app/**/*.tsx', recursive=True):
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # First, remove existing rel="noreferrer" or rel="noopener noreferrer"
    content = re.sub(r'rel=\"(?:noopener )?noreferrer\"', '', content)
    
    # Then add it near target="_blank"
    new_content = content.replace('target="_blank"', 'target="_blank" rel="noopener noreferrer"')
    
    if content != new_content:
        with open(file, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f'Fixed {file}')
