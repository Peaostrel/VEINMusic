import re

def sanitize_text(text_val: str) -> str:
    if not text_val: 
        return text_val
    # Remove HTML tags
    text_val = re.sub(r'<[^>]*>', '', text_val)
    # Escape quotes and brackets
    return text_val.replace('"', '&quot;').replace("'", '&#39;').replace('<', '&lt;').replace('>', '&gt;')
