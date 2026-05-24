const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const docxPath = 'c:/Users/19067/Desktop/xxxxxx/t/cd/rg/微信小游戏塔防肉鸽_开发需求文档.docx';
const backupPath = 'c:/Users/19067/Desktop/xxxxxx/t/cd/rg/微信小游戏塔防肉鸽_开发需求文档_backup.docx';
const outputPath = 'c:/Users/19067/Desktop/xxxxxx/t/cd/rg/微信小游戏塔防肉鸽_开发需求文档_v1.1.docx';

// 备份
fs.copyFileSync(docxPath, backupPath);

// 解压
const zip = new AdmZip(docxPath);
const zipEntries = zip.getEntries();

// 读取document.xml
const docXml = zip.readAsText('word/document.xml');

// 处理XML：为每个没有rFonts的rPr添加中文字体声明
// 查找所有 <w:rPr>...</w:rPr> 并检查是否包含 <w:rFonts>
let modifiedXml = docXml;

// 正则匹配所有rPr块，如果不含rFonts则添加
const rPrRegex = /<w:rPr>(?!<w:rFonts).*?<\/w:rPr>/g;
modifiedXml = modifiedXml.replace(rPrRegex, (match) => {
    if (!match.includes('<w:rFonts')) {
        // 在rPr开始标签后添加字体声明
        return match.replace(
            /<w:rPr>/,
            `<w:rPr><w:rFonts w:ascii="Microsoft YaHei" w:hAnsi="Microsoft YaHei" w:eastAsia="Microsoft YaHei" w:cs="Microsoft YaHei"/>`
        );
    }
    return match;
});

// 写入修改后的XML
const tempDir = 'c:/Users/19067/Desktop/xxxxxx/t/cd/rg/temp_docx';
if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
}
fs.mkdirSync(tempDir, { recursive: true });

// 解压所有文件
zipEntries.forEach(entry => {
    const entryPath = path.join(tempDir, entry.entryName);
    if (entry.isDirectory) {
        fs.mkdirSync(entryPath, { recursive: true });
    } else {
        fs.mkdirSync(path.dirname(entryPath), { recursive: true });
        fs.writeFileSync(entryPath, entry.getData());
    }
});

// 修改document.xml
const docPath = path.join(tempDir, 'word/document.xml');
fs.writeFileSync(docPath, modifiedXml, 'utf-8');

// 重新打包
const newZip = new AdmZip();
const addFiles = (dir) => {
    const entries = fs.readdirSync(dir);
    entries.forEach(entry => {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            addFiles(fullPath);
        } else {
            newZip.addLocalFile(fullPath, path.relative(tempDir, path.dirname(fullPath)));
        }
    });
};
addFiles(tempDir);

newZip.writeZip(outputPath);

// 清理
fs.rmSync(tempDir, { recursive: true });

console.log('文档修复完成！');
console.log('备份文件:', backupPath);
console.log('输出文件:', outputPath);
