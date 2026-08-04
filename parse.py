import json

with open(r'C:\Users\mozky\.gemini\antigravity\brain\c102e915-27eb-431e-9708-3c2abc0b388d\.system_generated\steps\11335\output.txt', 'r', encoding='utf-8') as f:
    data = json.loads(f.read())

if 'issues' in data:
    for i, issue in enumerate(data['issues']):
        comp = issue.get('component', '').split(':')[-1]
        line = issue.get('textRange', {}).get('startLine', '?')
        print(f"{i+1}. {comp}:{line} - {issue.get('message')}")
