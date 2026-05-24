import xml.etree.ElementTree as ET
import zipfile
import re
import os

docx_path = r'c:\Users\19067\Desktop\xxxxxx\t\cd\rg\微信小游戏塔防肉鸽_开发需求文档.docx'

with zipfile.ZipFile(docx_path, 'r') as z:
    xml_content = z.read('word/document.xml')

root = ET.fromstring(xml_content)

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

text_parts = []
for t_elem in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'):
    text_parts.append(t_elem.text or '')

full_text = ''.join(text_parts)

# Replace common issues
# Check for replacement characters
problematic = []
for i, ch in enumerate(full_text):
    code = ord(ch)
    if code > 0x4e00 and code < 0x9fff:  # Chinese chars
        pass
    elif ch in '\n\r\t ':
        pass
    elif code > 127:
        pass
    else:
        pass

# Look for obvious replacement patterns (private use area, etc.)
for i, ch in enumerate(full_text):
    code = ord(ch)
    if 0xE000 <= code <= 0xF8FF:  # Private Use Area
        problematic.append((i, ch, code))
    elif 0xFFFD == code:  # Replacement character
        problematic.append((i, ch, code))

# Output the full text with some structure
lines = full_text.split('\n')

# Save to a readable file
output_path = r'c:\Users\19067\Desktop\xxxxxx\t\cd\rg\document_content.txt'
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(full_text)

print(f"Document extracted to {output_path}")
print(f"Total characters: {len(full_text)}")
print(f"Problematic characters found: {len(problematic)}")

if problematic:
    for pos, ch, code in problematic[:50]:
        context = full_text[max(0,pos-20):pos+20]
        print(f"  Pos {pos}: U+{code:04X} in context: ...{context}...")
