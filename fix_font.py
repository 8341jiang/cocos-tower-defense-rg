import xml.etree.ElementTree as ET
import xml.dom.minidom
import zipfile
import os
import shutil
import re

docx_path = r'c:\Users\19067\Desktop\xxxxxx\t\cd\rg\微信小游戏塔防肉鸽_开发需求文档.docx'
backup_path = r'c:\Users\19067\Desktop\xxxxxx\t\cd\rg\微信小游戏塔防肉鸽_开发需求文档_backup.docx'
output_path = r'c:\Users\19067\Desktop\xxxxxx\t\cd\rg\微信小游戏塔防肉鸽_开发需求文档.docx'

# Backup original
shutil.copy2(docx_path, backup_path)

# Extract the docx
extract_dir = r'c:\Users\19067\Desktop\xxxxxx\t\cd\rg\docx_temp'
if os.path.exists(extract_dir):
    shutil.rmtree(extract_dir)
os.makedirs(extract_dir)

with zipfile.ZipFile(docx_path, 'r') as z:
    z.extractall(extract_dir)

# Read document.xml
doc_path = os.path.join(extract_dir, 'word', 'document.xml')
with open(doc_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add Chinese font declaration to fix display issues
# Find the first rPr or add font reference
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

# Parse the XML
root = ET.fromstring(content)

# Find the styles or font references section
# We need to add a run font that supports Chinese characters

# The main issue: Word might be using a font that doesn't support all Chinese characters
# Solution: Add explicit East Asia font references

# First, check if there's a fonts element
rFonts_elements = root.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}rFonts')

# For each run that has text but no explicit Chinese font, add one
for rPr in root.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}rPr'):
    # Check if there's text content in the parent's siblings
    r = rPr.getparent()
    if r is not None:
        has_text = any(t.tag.endswith('}t') for t in r)
        has_rFonts = any(t.tag.endswith('}rFonts') for t in rPr)
        if has_text and not has_rFonts:
            # Add font reference for Chinese
            rFonts = ET.SubElement(rPr, '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}rFonts')
            rFonts.set('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}ascii', 'Microsoft YaHei')
            rFonts.set('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}hAnsi', 'Microsoft YaHei')
            rFonts.set('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}eastAsia', 'Microsoft YaHei')

# Save modified document.xml
tree = ET.ElementTree(root)
ET.indent(tree, space=None)
tree.write(doc_path, encoding='utf-8', xml_declaration=True)

# Re-package the docx
with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as z:
    for root_dir, dirs, files in os.walk(extract_dir):
        for file in files:
            file_path = os.path.join(root_dir, file)
            arcname = os.path.relpath(file_path, extract_dir)
            z.write(file_path, arcname)

# Cleanup
shutil.rmtree(extract_dir)

print("Font fix applied successfully!")
print("Backup saved to:", backup_path)
