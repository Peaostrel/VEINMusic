path_extended = "e:\\VEIN\\VEINMusic\\app\\routers\\extended.py"
with open(path_extended, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("parts = re.split(r'[ \t]*[-—][ \t]*', ach.rule_meta)", "parts = [p.strip() for p in ach.rule_meta.replace('—', '-').split('-')]")
content = content.replace("parts = re.split(r'[ \t]*[-—][ \t]*', ach.rule_target)", "parts = [p.strip() for p in ach.rule_target.replace('—', '-').split('-')]")
content = content.replace("parts = re.split(r'[ \t]*[-—][ \t]*', a.rule_meta)", "parts = [p.strip() for p in a.rule_meta.replace('—', '-').split('-')]")
content = content.replace("parts = re.split(r'[ \t]*[-—][ \t]*', a.rule_target)", "parts = [p.strip() for p in a.rule_target.replace('—', '-').split('-')]")
content = content.replace("parts = re.split(r'[ \t]*[-—][ \t]*', album_name)", "parts = [p.strip() for p in album_name.replace('—', '-').split('-')]")

with open(path_extended, "w", encoding="utf-8") as f:
    f.write(content)

path_metadata = "e:\\VEIN\\VEINMusic\\app\\services\\metadata_search.py"
with open(path_metadata, "r", encoding="utf-8") as f:
    content_meta = f.read()

content_meta = content_meta.replace("parts = re.split(r'[ \t]*[-—][ \t]*', query.strip())", "parts = [p.strip() for p in query.strip().replace('—', '-').split('-')]")

with open(path_metadata, "w", encoding="utf-8") as f:
    f.write(content_meta)
