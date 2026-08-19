import fs from 'fs';
import path from 'path';

function getFiles(dir: string, fileList: string[] = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getFiles(filePath, fileList);
    } else if (filePath.endsWith('.ts')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

async function main() {
  const commandsDir = path.join(__dirname, '../src/commands');
  const files = getFiles(commandsDir);
  
  const commands = [];
  
  for (const fullPath of files) {
    try {
      const category = path.basename(path.dirname(fullPath));
      const mod = await import(fullPath);
      if (mod.data) {
        commands.push({
          category,
          data: mod.data.toJSON()
        });
      }
    } catch (e) {
      console.error(`Error loading ${fullPath}:`, e);
    }
  }
  
  fs.writeFileSync(path.join(__dirname, 'commands-dump.json'), JSON.stringify(commands, null, 2));
}

main().catch(console.error);
