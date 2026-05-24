// Fix Word document Chinese font display issue
const fs = require('fs');
const { execSync } = require('child_process');

const docPath = 'c:/Users/19067/Desktop/xxxxxx/t/cd/rg/微信小游戏塔防肉鸽_开发需求文档.docx';
const xmlPath = 'c:/Users/19067/Desktop/xxxxxx/t/cd/rg/document.xml';

// Read the extracted XML
let xml = fs.readFileSync(xmlPath, 'utf-8');

// Add font references to all rPr elements that don't have rFonts
// Pattern: <w:rPr> followed by content that doesn't include <w:rFonts
const fontDecl = '<w:rFonts w:ascii="Microsoft YaHei" w:hAnsi="Microsoft YaHei" w:eastAsia="Microsoft YaHei" w:cs="Microsoft YaHei"/>';

// Replace all rPr blocks that don't already have rFonts
xml = xml.replace(/(<w:rPr>)(?!<w:rFonts)/g, '$1' + fontDecl);

// Write back
fs.writeFileSync(xmlPath, xml, 'utf-8');

console.log('Font fix applied to document.xml');
