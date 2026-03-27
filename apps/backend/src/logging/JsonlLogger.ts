import fs from 'node:fs';
import path from 'node:path';
import { SearchLogRecord } from '../types';

export class JsonlLogger {
  private stream: fs.WriteStream;

  constructor(private directory = path.resolve(process.cwd(), 'logs')) {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
    const file = path.join(directory, `search-${new Date().toISOString().slice(0, 10)}.jsonl`);
    this.stream = fs.createWriteStream(file, { flags: 'a', encoding: 'utf8' });
  }

  write(record: SearchLogRecord) {
    this.stream.write(JSON.stringify(record) + '\n');
  }
}


