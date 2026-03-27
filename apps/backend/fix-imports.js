import fs from 'fs';
import path from 'path';

function fixImports(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            fixImports(fullPath);
        } else if (entry.name.endsWith('.mjs')) {
            let content = fs.readFileSync(fullPath, 'utf8');

            // 修复相对路径导入，添加.mjs扩展名
            content = content.replace(/from ['"]([^'"]*\.js)['"]/g, 'from "$1"');
            content = content.replace(/from ['"]([^'"]*\.ts)['"]/g, 'from "$1"');
            content = content.replace(/from ['"]([^'"]*\.jsx)['"]/g, 'from "$1"');
            content = content.replace(/from ['"]([^'"]*\.tsx)['"]/g, 'from "$1"');

            // 修复没有扩展名的相对路径导入（只处理相对路径）
            content = content.replace(/from ['"](\.\/[^'"]*?)['"]/g, 'from "$1.mjs"');
            content = content.replace(/from ['"](\.\.\/[^'"]*?)['"]/g, 'from "$1.mjs"');

            fs.writeFileSync(fullPath, content);
        }
    });
}

fixImports('dist');
console.log('Import paths fixed successfully!');
